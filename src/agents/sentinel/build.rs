use std::fs;
use std::path::Path;

fn main() {
    let debug_path = Path::new("../../target/bpfel-unknown-none/debug/sentinel-kernel");
    let release_path = Path::new("../../target/bpfel-unknown-none/release/sentinel-kernel");

    if let Some(parent) = debug_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Some(parent) = release_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if !debug_path.exists() {
        let _ = fs::write(debug_path, &[]);
    }
    if !release_path.exists() {
        let _ = fs::write(release_path, &[]);
    }
}
