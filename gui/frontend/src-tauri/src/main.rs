// RLinf Studio — Tauri 2.x desktop entry point
//
// This is the binary entry point. All Tauri setup lives in lib.rs so
// that it can also be used as a library target (required by Tauri 2.x).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    rlinf_studio_lib::run();
}
