/**
 * Default SXR package manifest matching tomotoru/sxr/pkg.json (v1027).
 * Can be overridden at runtime via the `server_config` store key `pkg_json`.
 */

export const DEFAULT_PKG_MANIFEST = Object.freeze({
  version: 1027,
  mainsxr: {
    size: 1238703,
    checksum: 2145863868,
    md5: "8DDA64087B100F9BC5D38934BFA2C512",
  },
  sxrlist: [
    {
      install: true,
      md5: "36A229CF1D8798F7241EE91736918818",
      size: 2009292,
      version: 283,
      sxrname: "1",
    },
    {
      install: true,
      md5: "32775EF7940E1194CB547136A034CFB7",
      size: 11958966,
      version: 273,
      sxrname: "0",
    },
    {
      install: true,
      md5: "89ED41F8D036B98852DD696CD5A13EAB",
      size: 8437637,
      version: 269,
      sxrname: "7",
    },
    {
      install: false,
      md5: "74565613706249BB0F71EC4BC78E3597",
      size: 428814,
      version: 265,
      sxrname: "5",
    },
    {
      install: false,
      md5: "001705B2512A06EBCB91FE08DC53A445",
      size: 18790723,
      version: 268,
      sxrname: "b",
    },
    {
      install: false,
      md5: "9B4CA905E3D90849AF9D095DE6DD4B17",
      size: 243662,
      version: 257,
      sxrname: "9",
    },
    {
      install: true,
      md5: "1635A41CA7F96034B2083636DA85D09D",
      size: 19280565,
      version: 264,
      sxrname: "a",
    },
    {
      install: false,
      md5: "133F83CEA0CE767D3A881D78B2C5B21F",
      size: 15173,
      version: 256,
      sxrname: "6",
    },
  ],
});

export function buildPkgManifest(baseManifest, origin) {
  const pkg = structuredClone(baseManifest || DEFAULT_PKG_MANIFEST);
  const cleanOrigin = origin.replace(/\/+$/, "");
  if (pkg.mainsxr) {
    pkg.mainsxr.url = `${cleanOrigin}/dl/main.sxr`;
  }
  for (const sxr of pkg.sxrlist || []) {
    const verHex = Number(sxr.version).toString(16).padStart(4, "0");
    sxr.url = `${cleanOrigin}/dl/${sxr.sxrname}-${verHex}.sxr`;
  }
  return pkg;
}
