use rustfft::FftPlanner;

fn main() {
    let sample_rate = 48000u32;
    let buffer_size = 4096usize;
    let frequency = 440.0f32;
    
    let buffer: Vec<f32> = (0..buffer_size)
        .map(|i| {
            let t = i as f32 / sample_rate as f32;
            0.5 * (2.0 * std::f32::consts::PI * frequency * t).sin()
        })
        .collect();
    
    let half_size = buffer_size / 2;
    
    let mut fft_work = vec![rustfft::num_complex::Complex::new(0.0, 0.0); buffer_size];
    let mut fft_planner = FftPlanner::new();
    
    for i in 0..buffer_size {
        fft_work[i] = rustfft::num_complex::Complex::new(buffer[i], 0.0);
    }
    let fft = fft_planner.plan_fft_forward(buffer_size);
    fft.process(&mut fft_work);
    for i in 0..buffer_size {
        let val = fft_work[i];
        fft_work[i] = val * val.conj();
    }
    let ifft = fft_planner.plan_fft_inverse(buffer_size);
    ifft.process(&mut fft_work);
    
    let auto_corr: Vec<f32> = fft_work[..half_size]
        .iter()
        .map(|c| c.re / buffer_size as f32)
        .collect();
    
    let mut energy = vec![0.0f32; half_size];
    for j in 0..half_size {
        energy[0] += buffer[j] * buffer[j];
    }
    for tau in 1..half_size {
        energy[tau] = energy[tau - 1]
            - buffer[tau - 1] * buffer[tau - 1]
            + buffer[tau + half_size - 1] * buffer[tau + half_size - 1];
    }
    
    println!("Analysis for 440 Hz sine wave:");
    println!("energy[0] = {:.6}", energy[0]);
    println!();
    
    for tau in [90, 92, 109, 184, 218, 327] {
        if tau < half_size {
            let d = energy[0] + energy[tau] - 2.0 * auto_corr[tau];
            let freq = sample_rate as f32 / tau as f32;
            let periods = tau as f32 / (sample_rate as f32 / frequency);
            println!("tau[{}]: auto_corr={:.6}, energy={:.6}, diff={:.6}, freq={:.2} Hz, periods={:.2}", 
                tau, auto_corr[tau], energy[tau], d, freq, periods);
        }
    }
    
    println!();
    println!("Checking if auto_corr goes negative:");
    for tau in 85..=95 {
        let freq = sample_rate as f32 / tau as f32;
        println!("  tau[{}]: auto_corr={:.6}, freq={:.2} Hz", tau, auto_corr[tau], freq);
    }
}
