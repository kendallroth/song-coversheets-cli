/** Split text quasi-evenly in half (by words) */
export const splitTextEvenly = (text: string): string[] => {
  const words = text.split(" ");
  let bestSplit = { diff: Number.POSITIVE_INFINITY, left: "", right: "'" };

  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(" ");
    const right = words.slice(i).join(" ");
    const diff = Math.abs(left.length - right.length);

    if (diff < bestSplit.diff) {
      bestSplit = { diff, left, right };
    }
  }

  return [bestSplit.left, bestSplit.right];
};
