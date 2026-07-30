export function splitRangeAcrossSegments(start, end, segmentHeight) {
  const safeHeight = Math.max(1, Math.floor(segmentHeight));
  const rangeStart = Math.max(0, Math.floor(start));
  const rangeEnd = Math.max(rangeStart, Math.ceil(end));
  const parts = [];
  let cursor = rangeStart;

  while (cursor < rangeEnd) {
    const index = Math.floor(cursor / safeHeight);
    const segmentTop = index * safeHeight;
    const partEnd = Math.min(rangeEnd, segmentTop + safeHeight);
    parts.push({
      index,
      globalStart: cursor,
      globalEnd: partEnd,
      localStart: cursor - segmentTop,
      length: partEnd - cursor,
      sourceOffset: cursor - rangeStart
    });
    cursor = partEnd;
  }
  return parts;
}
