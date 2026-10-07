pub mod onset;
pub mod preprocessor;
pub mod capture;
pub mod pitch;
pub mod device;
pub mod device_monitor;
pub mod pipeline;

#[cfg(target_os = "windows")]
pub mod wasapi_exclusive;

pub use capture::AudioCapture;
pub use pitch::{PitchDetector, PitchResult, PitchConfidence};
pub use device::AudioDeviceInfo;
pub use preprocessor::AudioPreprocessor;
pub use device_monitor::{DeviceMonitor, DeviceChangeEvent};
pub use onset::{ClockedOnsetDetector, OnsetDetector};
pub use pipeline::{AudioPipeline, AudioLevelInfo};
