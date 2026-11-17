export function fitsCargo(
  item: { widthCm: number; heightCm: number; depthCm: number },
  cargo: { width: number; height: number; depth: number },
): boolean {
  return (
    cargo.width >= item.widthCm &&
    cargo.height >= item.heightCm &&
    cargo.depth >= item.depthCm
  );
}