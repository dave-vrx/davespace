/** Stable interchange format for the future VRSpace Unity editor exporter. */
export interface VRSpaceWorldPackage {
  format: "vrspace-world";
  version: 1;
  id: string;
  name: string;
  scene: string;
  spawn?: [number, number, number];
  thumbnail?: string;
  scripts?: string[];
  assets?: string[];
}

export async function loadWorldPackage(
  url: string,
): Promise<VRSpaceWorldPackage> {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`World package failed: ${response.status}`);
  const data = (await response.json()) as Partial<VRSpaceWorldPackage>;
  if (data.format !== "vrspace-world" || data.version !== 1 || !data.scene)
    throw new Error("Unsupported VRSpace world package");
  return data as VRSpaceWorldPackage;
}
