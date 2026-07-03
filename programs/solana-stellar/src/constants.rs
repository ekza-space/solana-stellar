pub const REGISTRY_SEED: &[u8] = b"registry";
pub const UNIVERSE_SEED: &[u8] = b"universe";
pub const UNIVERSE_INDEX_SEED: &[u8] = b"universe_index";
pub const ASSET_SEED: &[u8] = b"asset";
pub const LINK_SEED: &[u8] = b"link";
pub const RELEASE_SEED: &[u8] = b"release";
pub const VAULT_SEED: &[u8] = b"release_vault";
pub const SHARE_SEED: &[u8] = b"share";
pub const RELEASE_DEPLOYMENT_SEED: &[u8] = b"release_deployment";
pub const PROJECT_PROFILE_SEED: &[u8] = b"project_profile";

pub const MAX_HASH_LEN: usize = 96;
pub const MAX_PROJECT_SLUG_LEN: usize = 32;
/// Model-format vocabulary entries ("vrm", "glb", …): lowercase slug rules.
pub const MAX_MODEL_FORMAT_LEN: usize = 16;
pub const MAX_SUPPORTED_FORMATS: usize = 8;
pub const BPS_DENOMINATOR: u16 = 10_000;
