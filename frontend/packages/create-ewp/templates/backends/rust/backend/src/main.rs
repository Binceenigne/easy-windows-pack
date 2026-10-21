#![cfg_attr(all(target_os = "windows", not(debug_assertions), not(test)), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
mod bridge;
#[cfg(target_os = "windows")]
mod host;
#[cfg(target_os = "windows")]
mod navigation;

#[cfg(target_os = "windows")]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let mut url = false;
    let mut assets = false;
    while let Some(option) = args.next() {
        match option.as_str() {
            "--help" => {
                println!("ewp-host [--url <loopback HTTP(S) URL> | --assets <directory>] [--title <text>] [--titlebar-mode <default|minimal|native>] [--debug]");
                return Ok(());
            }
            "--debug" => std::env::set_var("EWP_DEBUG", "1"),
            "--url" | "--assets" | "--title" | "--titlebar-mode" => {
                let value = args.next().filter(|x| !x.is_empty()).ok_or("Missing host option value")?;
                let key = match option.as_str() {
                    "--url" => {url = true; std::env::remove_var("EWP_ASSETS"); "EWP_DEV_URL"}
                    "--assets" => {assets = true; std::env::remove_var("EWP_DEV_URL"); "EWP_ASSETS"}
                    "--titlebar-mode" => "EWP_TITLEBAR_MODE",
                    _ => "EWP_APP_TITLE",
                };
                if url && assets { return Err("--url and --assets are mutually exclusive".into()); }
                std::env::set_var(key, value);
            }
            _ => return Err(format!("Unknown host option: {option}").into()),
        }
    }
    if std::env::var_os("EWP_DEV_URL").is_some_and(|x| !x.is_empty())
        && std::env::var_os("EWP_ASSETS").is_some_and(|x| !x.is_empty()) {
        return Err("EWP_DEV_URL and EWP_ASSETS are mutually exclusive".into());
    }
    host::run()
}

#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("This ewp-host template supports Windows only.");
    std::process::exit(1);
}
