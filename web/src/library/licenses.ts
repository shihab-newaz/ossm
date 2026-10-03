export type LicenseInfo = { label: string; summary: string };

const CC = "Creative Commons";

/** What each license on a track means, in a sentence or two, for the chip's popover. */
export const LICENSES: Record<string, LicenseInfo> = {
  "All rights reserved": {
    label: "All rights reserved",
    summary: "The rights holder has not offered any special permissions. It is here for your own listening; do not copy or share it without permission.",
  },
  "CC BY": { label: "CC BY", summary: `${CC} Attribution. Anyone may share and adapt this, even commercially, as long as the creator is credited.` },
  "CC BY-SA": { label: "CC BY-SA", summary: `${CC} Attribution-ShareAlike. May be shared and adapted with credit, as long as the new work uses the same license.` },
  "CC BY-NC": { label: "CC BY-NC", summary: `${CC} Attribution-NonCommercial. May be shared and adapted with credit, but not for commercial purposes.` },
  "CC BY-ND": { label: "CC BY-ND", summary: `${CC} Attribution-NoDerivatives. May be shared with credit, but only unchanged: no remixes or edits.` },
  "CC BY-NC-SA": { label: "CC BY-NC-SA", summary: `${CC} Attribution-NonCommercial-ShareAlike. With credit, non-commercial only, and new work must use the same license.` },
  "CC BY-NC-ND": { label: "CC BY-NC-ND", summary: `${CC} Attribution-NonCommercial-NoDerivatives. May be shared unchanged, with credit, for non-commercial purposes only.` },
  CC0: { label: "CC0", summary: `${CC} Zero. The creator has given up their rights: it can be used for anything, with no credit required.` },
};

export function licenseInfo(license: string): LicenseInfo {
  return LICENSES[license] ?? { label: license, summary: "This license is not one OSSM knows. Check the files you uploaded for its terms." };
}
