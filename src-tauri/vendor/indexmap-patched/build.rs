fn main() {
    // 🚨 本地补丁（2026-10-02，FretMaster）：原实现用 `autocfg` **探测** sysroot 里的 std：
    //     match std::env::var_os("CARGO_FEATURE_STD") {
    //         Some(_) => autocfg::emit("has_std"),
    //         None => autocfg::new().emit_sysroot_crate("std"),   // ← 本机探测失败
    //     }
    // 在本机（rustc 1.97.1 / x86_64-pc-windows-msvc）实测该探测恒为 false：
    //     warning: autocfg could not probe for `std`
    //     probe_sysroot_crate(std) = false
    // ⇒ 走 `#[cfg(not(has_std))] pub struct IndexMap<K, V, S>`（3 个泛型参数无默认值）
    // ⇒ 传递依赖 `schemars 0.8.22`（Tauri 生态，开了 preserve_order）写的
    //    `pub type Map<K, V> = indexmap::IndexMap<K, V>;` 只给 2 个参数
    // ⇒ `error[E0107]: struct takes 3 generic arguments but 2 were supplied`
    // ⇒ `cargo build --release` 失败，桌面安装包当时无法产出。
    //    ⚠️ 订正（2026-10-02）：我曾写「bundle/ 一直为空」——那是**误判**。
    //    产物其实一直在 MSVC 三元组目录下：
    //    `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/{msi,nsis}/`
    //    （`target/release/bundle/` 确实不存在，我当时只看了那里）。
    //
    // 我们构建的目标是桌面端（有 std）⇒ **无条件 emit 是正确的**。
    // 若将来要 cross-compile 到 no_std 目标，需要改回按目标判定。
    autocfg::emit("has_std");
    autocfg::rerun_path("build.rs");
}
