use std::{env, error::Error, path::{Component, Path, PathBuf}};
use url::{Host, Url};

/// One trusted development origin OR one bundled entry document. Asset requests
/// are unaffected; hash/query routing works without granting other files IPC.
#[derive(Clone, Debug)]
pub struct Navigation {
    pub entry: Url,
    development: bool,
    pub assets: Option<PathBuf>,
}

impl Navigation {
    pub fn from_environment() -> Result<Self, Box<dyn Error>> {
        match env::var("EWP_DEV_URL") {
            Ok(value) if !value.trim().is_empty() => return Self::development(value.trim()),
            Err(env::VarError::NotUnicode(_)) => return Err("EWP_DEV_URL must be Unicode".into()),
            _ => {}
        }

        if let Some(path) = env::var_os("EWP_ASSETS") {
            return Self::bundled(&PathBuf::from(path).join("index.html"));
        }

        let executable = env::current_exe()?;
        let bundled = executable
            .parent()
            .ok_or("Cannot locate the executable directory")?
            .join("frontend/index.html");
        if bundled.is_file() {
            return Self::bundled(&bundled);
        }

        // CARGO_MANIFEST_DIR is backend/, regardless of the caller's cwd or
        // --manifest-path. Also supports cargo run --release from source.
        let source = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or("Cannot locate the project root")?
            .join("output/frontend/index.html");
        if source.is_file() {
            return Self::bundled(&source);
        }
        Err(format!(
            "Frontend entry not found. Expected {} (packaged) or {} (source). Build the frontend or set EWP_DEV_URL to a local development server.",
            bundled.display(), source.display()
        ).into())
    }

    fn development(value: &str) -> Result<Self, Box<dyn Error>> {
        let entry = Url::parse(value)?;
        let loopback = match entry.host() {
            Some(Host::Domain(host)) => host == "localhost",
            Some(Host::Ipv4(address)) => address.is_loopback(),
            Some(Host::Ipv6(address)) => address.is_loopback(),
            None => false,
        };
        if !loopback
            || !matches!(entry.scheme(), "http" | "https")
            || !entry.username().is_empty()
            || entry.password().is_some()
        {
            return Err("EWP_DEV_URL must be an http(s) loopback URL without credentials".into());
        }
        Ok(Self { entry, development: true, assets: None })
    }

    fn bundled(path: &Path) -> Result<Self, Box<dyn Error>> {
        // std::fs::canonicalize produces \\?\ paths on Windows; dunce converts
        // ordinary disk paths to a form Url::from_file_path can safely encode.
        let path = dunce::canonicalize(path)?;
        let file = Url::from_file_path(&path).map_err(|_| "Cannot encode frontend file URL")?;
        if file.host_str().is_some() {
            return Err("The frontend must be on a local disk, not a UNC share".into());
        }
        if !path.is_file() { return Err("Assets must contain index.html".into()); }
        let assets = path.parent().ok_or("Missing assets directory")?.to_path_buf();
        validate_tree(&assets)?;
        Ok(Self { entry: Url::parse("https://ewp.local/index.html")?, development: false, assets: Some(assets) })
    }

    pub fn is_development(&self) -> bool {
        self.development
    }

    pub fn allows(&self, value: &str) -> bool {
        let Ok(mut candidate) = Url::parse(value) else { return false };
        if !candidate.username().is_empty() || candidate.password().is_some() {
            return false;
        }
        if self.development {
            // Compare parsed scheme + host + effective port, never a prefix.
            return matches!(candidate.scheme(), "http" | "https")
                && candidate.origin() == self.entry.origin();
        }
        candidate.set_query(None);
        candidate.set_fragment(None);
        candidate == self.entry
    }

    pub fn script_policy(&self) -> serde_json::Value {
        serde_json::json!({
            "entry": self.entry.as_str(),
            "development": self.development,
        })
    }
}

fn validate_tree(path: &Path) -> Result<(), Box<dyn Error>> {
    use std::os::windows::fs::MetadataExt;
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let metadata = std::fs::symlink_metadata(entry.path())?;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("Assets may not contain symbolic links or junctions".into());
        }
        if metadata.is_dir() { validate_tree(&entry.path())?; }
    }
    Ok(())
}

// A decoded, canonical path must remain inside the selected frontend root.
// Reject Windows alternate data streams, separators and dot traversal before IO.
pub fn resource(root: &Path, uri: &str) -> Result<(Vec<u8>, &'static str), Box<dyn Error>> {
    let url = Url::parse(uri)?;
    // Wry reverses https://ewp.local/... to ewp://local/... for the handler.
    if !((url.scheme() == "ewp" && url.host_str() == Some("local"))
        || (url.scheme() == "https" && url.host_str() == Some("ewp.local"))) {
        return Err("Unknown asset origin".into());
    }
    let decoded = percent_encoding::percent_decode_str(url.path()).decode_utf8()?;
    let relative = decoded.strip_prefix('/').ok_or("Invalid resource path")?;
    if relative.contains(['\\', ':', '\0']) || relative.split('/').any(|x| x == "." || x == "..") {
        return Err("Invalid resource path".into());
    }
    let path = Path::new(relative);
    if path.components().any(|part| !matches!(part, Component::Normal(_))) { return Err("Invalid resource path".into()); }
    let path = dunce::canonicalize(root.join(path))?;
    if !path.starts_with(root) || !path.is_file() { return Err("Resource outside assets".into()); }
    let mime = match path.extension().and_then(|x| x.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8", "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8", "json" | "map" => "application/json",
        "svg" => "image/svg+xml", "png" => "image/png", "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp", "ico" => "image/x-icon", "woff" => "font/woff",
        "woff2" => "font/woff2", "wasm" => "application/wasm", _ => "application/octet-stream",
    };
    Ok((std::fs::read(path)?, mime))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn development_requires_exact_origin_and_loopback() {
        let policy = Navigation::development("http://localhost:5173/app").unwrap();
        assert!(policy.allows("http://localhost:5173/settings?q=1#tab"));
        for url in [
            "https://localhost:5173/", "http://localhost:5174/",
            "http://localhost.evil.test:5173/", "http://localhost:5173@evil.test/",
            "http://user@localhost:5173/", "http://127.0.0.1:5173/",
            "file:///C:/app/index.html", "data:text/html,test", "about:blank",
            "blob:http://localhost:5173/123",
        ] {
            assert!(!policy.allows(url), "{url}");
        }
        for url in ["https://example.com/", "http://192.168.1.2/", "file:///C:/app/index.html"] {
            assert!(Navigation::development(url).is_err());
        }
        assert!(Navigation::development("http://[::1]:5173/").is_ok());
        assert!(Navigation::development("http://127.0.0.1:5173/").is_ok());
    }

    #[test]
    fn bundled_allows_only_the_entry_and_its_hash_or_query() {
        let policy = Navigation {
            entry: Url::parse("https://ewp.local/index.html").unwrap(),
            development: false,
            assets: None,
        };
        assert!(policy.allows("https://ewp.local/index.html?theme=dark#/settings"));
        for url in [
            "file:///C:/My%20App/frontend/other.html",
            "file:///C:/My%20App/frontend/../index.html",
            "file://server/share/frontend/index.html",
            "https://example.com/index.html", "about:blank",
            "https://ewp.local/other.html", "https://ewp.local/index.html.evil",
        ] {
            assert!(!policy.allows(url), "{url}");
        }
    }

    #[test]
    fn production_resource_paths_remain_inside_assets() {
        let root = env::temp_dir().join(format!("ewp-assets-test-{}", std::process::id()));
        std::fs::create_dir_all(root.join("assets")).unwrap();
        std::fs::write(root.join("index.html"), "<html></html>").unwrap();
        std::fs::write(root.join("assets/app.js"), "export default 1").unwrap();
        let root = dunce::canonicalize(root).unwrap();
        assert_eq!(resource(&root, "ewp://local/assets/app.js").unwrap().1, "text/javascript; charset=utf-8");
        assert!(resource(&root, "ewp://local/index.html?q=1").is_ok());
        for uri in [
            "ewp://local/%2e%2e%2fsecret.txt", "ewp://local/%5c..%5csecret.txt",
            "ewp://local/index.html%3Asecret", "ewp://local/%00index.html",
            "ewp://evil/index.html", "file:///C:/Windows/win.ini",
        ] {
            assert!(resource(&root, uri).is_err(), "{uri}");
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
