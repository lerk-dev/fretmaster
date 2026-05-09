#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::pitch::{PitchDetector, PitchDetectorConfig, frequency_to_note};
    use std::f32::consts::PI;

    fn generate_sine_wave(frequency: f32, sample_rate: u32, duration_ms: u32) -> Vec<f32> {
        let samples = (sample_rate as f32 * duration_ms as f32 / 1000.0) as usize;
        let mut buffer = Vec::with_capacity(samples);
        
        for i in 0..samples {
            let t = i as f32 / sample_rate as f32;
            let sample = (2.0 * PI * frequency * t).sin();
            buffer.push(sample);
        }
        
        buffer
    }

    fn generate_sine_wave_with_harmonics(
        fundamental: f32,
        harmonics: &[f32],
        sample_rate: u32,
        duration_ms: u32,
    ) -> Vec<f32> {
        let samples = (sample_rate as f32 * duration_ms as f32 / 1000.0) as usize;
        let mut buffer = vec![0.0f32; samples];
        
        for (harmonic_idx, &amplitude) in harmonics.iter().enumerate() {
            let freq = fundamental * (harmonic_idx + 1) as f32;
            for i in 0..samples {
                let t = i as f32 / sample_rate as f32;
                buffer[i] += amplitude * (2.0 * PI * freq * t).sin();
            }
        }
        
        let max_val = buffer.iter().map(|x| x.abs()).fold(0.0f32, f32::max);
        if max_val > 0.0 {
            for sample in buffer.iter_mut() {
                *sample /= max_val;
            }
        }
        
        buffer
    }

    fn add_noise(buffer: &mut Vec<f32>, noise_level: f32) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64;
        let mut rng_state = seed;
        
        for sample in buffer.iter_mut() {
            rng_state = rng_state.wrapping_mul(1103515245).wrapping_add(12345);
            let noise = ((rng_state >> 16) as f32 / 32768.0 - 1.0) * noise_level;
            *sample += noise;
        }
    }

    #[test]
    fn test_frequency_to_note_conversion() {
        let test_cases = vec![
            (440.0, "A", 4, 0.0),
            (261.63, "C", 4, 0.0),
            (329.63, "E", 4, 0.0),
            (196.00, "G", 3, 0.0),
            (82.41, "E", 2, 0.0),
            (466.16, "A\u{266F}", 4, 0.0),
            (293.66, "D", 4, 0.0),
            (349.23, "F", 4, 0.0),
        ];

        for (freq, expected_note, expected_octave, _expected_cents) in test_cases {
            let (note, octave, cents) = frequency_to_note(freq);
            assert_eq!(
                note, expected_note,
                "频率 {} Hz 应该识别为 {}，但得到 {}",
                freq, expected_note, note
            );
            assert_eq!(
                octave, expected_octave,
                "频率 {} Hz 应该是第 {} 八度，但得到第 {} 八度",
                freq, expected_octave, octave
            );
            assert!(
                cents.abs() < 50.0,
                "频率 {} Hz 的音分偏差应该小于 50，但得到 {}",
                freq, cents
            );
        }
    }

    #[test]
    fn test_pitch_detection_standard_notes() {
        let config = PitchDetectorConfig {
            sample_rate: 48000,
            buffer_size: 8192,
            ..Default::default()
        };
        let mut detector = PitchDetector::new(config);

        let test_frequencies = vec![
            (82.41, "E", 2),
            (110.0, "A", 2),
            (146.83, "D", 3),
            (196.0, "G", 3),
            (246.94, "B", 3),
            (329.63, "E", 4),
            (440.0, "A", 4),
            (880.0, "A", 5),
        ];

        for (freq, expected_note, expected_octave) in test_frequencies {
            let buffer = generate_sine_wave(freq, 48000, 200);
            
            let result = detector.detect(&buffer);
            assert!(
                result.is_some(),
                "应该能检测到频率 {} Hz 的音高",
                freq
            );
            
            let pitch = result.unwrap();
            assert_eq!(
                pitch.note, expected_note,
                "频率 {} Hz 应该识别为 {}，但得到 {}",
                freq, expected_note, pitch.note
            );
            assert_eq!(
                pitch.octave, expected_octave,
                "频率 {} Hz 应该是第 {} 八度，但得到第 {} 八度",
                freq, expected_octave, pitch.octave
            );
            assert!(
                pitch.confidence.overall > 0.5,
                "频率 {} Hz 的置信度应该 > 0.5，但得到 {}",
                freq, pitch.confidence.overall
            );
        }
    }

    #[test]
    fn test_pitch_detection_with_harmonics() {
        let config = PitchDetectorConfig {
            sample_rate: 48000,
            buffer_size: 8192,
            enable_harmonic_check: true,
            ..Default::default()
        };
        let mut detector = PitchDetector::new(config);

        let harmonics = vec![1.0, 0.5, 0.3, 0.2, 0.1];
        let buffer = generate_sine_wave_with_harmonics(220.0, &harmonics, 48000, 200);
        
        let result = detector.detect(&buffer);
        assert!(result.is_some(), "应该能检测到带泛音的基频");
        
        let pitch = result.unwrap();
        assert_eq!(pitch.note, "A", "220 Hz 应该识别为 A");
        assert_eq!(pitch.octave, 3, "220 Hz 应该是第 3 八度");
        assert!(
            pitch.confidence.harmonic_score > 0.3,
            "谐波检查分数应该 > 0.3"
        );
    }

    #[test]
    fn test_pitch_detection_noise_tolerance() {
        let config = PitchDetectorConfig {
            sample_rate: 48000,
            buffer_size: 8192,
            threshold: 0.15,
            ..Default::default()
        };
        let mut detector = PitchDetector::new(config);

        let mut buffer = generate_sine_wave(440.0, 48000, 200);
        add_noise(&mut buffer, 0.1);
        
        let result = detector.detect(&buffer);
        assert!(
            result.is_some(),
            "应该能在低噪声环境下检测到音高"
        );
        
        let pitch = result.unwrap();
        assert_eq!(pitch.note, "A", "440 Hz 应该识别为 A");
        assert!(
            (pitch.frequency - 440.0).abs() < 2.0,
            "检测到的频率 {} Hz 应该接近 440 Hz",
            pitch.frequency
        );
    }

    #[test]
    fn test_pitch_detection_silence() {
        let config = PitchDetectorConfig::default();
        let mut detector = PitchDetector::new(config);

        let silence = vec![0.0f32; 8192];
        let result = detector.detect(&silence);
        assert!(
            result.is_none(),
            "静音应该不返回任何音高检测结果"
        );
    }

    #[test]
    fn test_pitch_detection_low_volume() {
        let config = PitchDetectorConfig::default();
        let mut detector = PitchDetector::new(config);

        let mut buffer = generate_sine_wave(440.0, 48000, 200);
        for sample in buffer.iter_mut() {
            *sample *= 0.001;
        }
        
        let result = detector.detect(&buffer);
        assert!(
            result.is_none(),
            "极低音量应该不返回音高检测结果"
        );
    }

    #[test]
    fn test_pitch_detection_frequency_range() {
        let config = PitchDetectorConfig {
            sample_rate: 48000,
            buffer_size: 8192,
            ..Default::default()
        };
        let mut detector = PitchDetector::new(config);

        let below_range = generate_sine_wave(20.0, 48000, 200);
        assert!(
            detector.detect(&below_range).is_none(),
            "低于最小频率的声音应该不被检测"
        );

        let above_range = generate_sine_wave(5000.0, 48000, 200);
        assert!(
            detector.detect(&above_range).is_none(),
            "高于最大频率的声音应该不被检测"
        );
    }

    #[test]
    fn test_temporal_smoothing() {
        let config = PitchDetectorConfig {
            sample_rate: 48000,
            buffer_size: 8192,
            enable_temporal_smoothing: true,
            ..Default::default()
        };
        let mut detector = PitchDetector::new(config);

        for _ in 0..5 {
            let buffer = generate_sine_wave(440.0, 48000, 100);
            let _ = detector.detect(&buffer);
        }

        let buffer = generate_sine_wave(442.0, 48000, 100);
        let result = detector.detect(&buffer);
        assert!(result.is_some());
        
        let pitch = result.unwrap();
        assert!(
            (pitch.frequency - 441.0).abs() < 2.0,
            "时间平滑应该减少频率跳变"
        );
    }

    #[test]
    fn test_calibration_offset() {
        let config = PitchDetectorConfig {
            sample_rate: 48000,
            buffer_size: 8192,
            calibration_offset: 100.0,
            ..Default::default()
        };
        let mut detector = PitchDetector::new(config);

        let buffer = generate_sine_wave(440.0, 48000, 200);
        let result = detector.detect(&buffer);
        assert!(result.is_some());
        
        let pitch = result.unwrap();
        assert!(
            pitch.calibration_offset == 100.0,
            "校准偏移应该被记录"
        );
    }

    #[test]
    fn test_volume_calculation() {
        let config = PitchDetectorConfig::default();
        let mut detector = PitchDetector::new(config);

        let buffer = generate_sine_wave(440.0, 48000, 200);
        let result = detector.detect(&buffer);
        assert!(result.is_some());
        
        let pitch = result.unwrap();
        assert!(
            pitch.volume_rms > 0.0,
            "RMS 音量应该大于 0"
        );
        assert!(
            pitch.volume_db_spl > 0.0 && pitch.volume_db_spl < 100.0,
            "dB SPL 应该在合理范围内"
        );
        assert!(
            pitch.max_amplitude > 0.9,
            "最大振幅应该接近 1.0"
        );
    }

    #[test]
    fn test_confidence_scoring() {
        let config = PitchDetectorConfig {
            sample_rate: 48000,
            buffer_size: 8192,
            enable_harmonic_check: true,
            enable_temporal_smoothing: true,
            ..Default::default()
        };
        let mut detector = PitchDetector::new(config);

        let buffer = generate_sine_wave(440.0, 48000, 200);
        let result = detector.detect(&buffer);
        assert!(result.is_some());
        
        let pitch = result.unwrap();
        assert!(
            pitch.confidence.yin_probability > 0.0 && pitch.confidence.yin_probability <= 1.0,
            "YIN 概率应该在 [0, 1] 范围内"
        );
        assert!(
            pitch.confidence.harmonic_score >= 0.0 && pitch.confidence.harmonic_score <= 1.0,
            "谐波分数应该在 [0, 1] 范围内"
        );
        assert!(
            pitch.confidence.temporal_consistency >= 0.0 && pitch.confidence.temporal_consistency <= 1.0,
            "时间一致性应该在 [0, 1] 范围内"
        );
        assert!(
            pitch.confidence.overall >= 0.0 && pitch.confidence.overall <= 1.0,
            "总体置信度应该在 [0, 1] 范围内"
        );
    }

    #[test]
    fn test_cents_accuracy() {
        let config = PitchDetectorConfig {
            sample_rate: 48000,
            buffer_size: 16384,
            ..Default::default()
        };
        let mut detector = PitchDetector::new(config);

        let test_cases = vec![
            (440.0, 0.0),
            (442.0, 7.85),
            (438.0, -7.89),
            (445.0, 19.56),
            (435.0, -19.78),
        ];

        for (freq, expected_cents) in test_cases {
            let buffer = generate_sine_wave(freq, 48000, 200);
            let result = detector.detect(&buffer);
            assert!(result.is_some());
            
            let pitch = result.unwrap();
            let cents_diff = (pitch.cents - expected_cents).abs();
            assert!(
                cents_diff < 10.0,
                "频率 {} Hz 的音分应该接近 {}，但得到 {}（差值 {}）",
                freq, expected_cents, pitch.cents, cents_diff
            );
        }
    }

    #[test]
    fn test_guitar_string_frequencies() {
        let config = PitchDetectorConfig {
            sample_rate: 48000,
            buffer_size: 8192,
            ..Default::default()
        };
        let mut detector = PitchDetector::new(config);

        let guitar_strings = vec![
            (329.63, "E", 4),
            (246.94, "B", 3),
            (196.00, "G", 3),
            (146.83, "D", 3),
            (110.00, "A", 2),
            (82.41, "E", 2),
        ];

        for (freq, expected_note, expected_octave) in guitar_strings {
            let buffer = generate_sine_wave(freq, 48000, 200);
            let result = detector.detect(&buffer);
            assert!(
                result.is_some(),
                "应该能检测到吉他 {} 弦频率 {} Hz",
                expected_note, freq
            );
            
            let pitch = result.unwrap();
            assert_eq!(
                pitch.note, expected_note,
                "频率 {} Hz 应该识别为 {}",
                freq, expected_note
            );
            assert_eq!(
                pitch.octave, expected_octave,
                "频率 {} Hz 应该是第 {} 八度",
                freq, expected_octave
            );
        }
    }

    #[test]
    fn test_chromatic_scale() {
        let config = PitchDetectorConfig {
            sample_rate: 48000,
            buffer_size: 8192,
            ..Default::default()
        };
        let mut detector = PitchDetector::new(config);

        let a4 = 440.0;
        for i in -12..=12 {
            let freq = a4 * 2.0f32.powf(i as f32 / 12.0);
            let buffer = generate_sine_wave(freq, 48000, 100);
            
            let result = detector.detect(&buffer);
            assert!(
                result.is_some(),
                "应该能检测到半音阶频率 {} Hz",
                freq
            );
            
            let pitch = result.unwrap();
            assert!(
                (pitch.frequency - freq).abs() < 2.0,
                "检测频率 {} Hz 应该接近实际频率 {} Hz",
                pitch.frequency, freq
            );
        }
    }
}
