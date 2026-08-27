const REPRESENTATIONS = ["text/html", "text/markdown"] as const;
const MEDIA_TYPE_PATTERN =
  /^(?:\*|[a-z\d!#$&^_.+-]+)\/(?:\*|[a-z\d!#$&^_.+-]+)$/u;

export type Representation = (typeof REPRESENTATIONS)[number];

interface AcceptEntry {
  position: number;
  quality: number;
  specificity: number;
  type: string;
}

const specificityFor = (type: string) => {
  if (type === "*/*") {
    return 0;
  }
  return type.endsWith("/*") ? 1 : 2;
};

const parseAccept = (header: string): AcceptEntry[] =>
  header
    .split(",")
    .map((raw, position) => {
      const [rawType = "", ...rawParameters] = raw
        .trim()
        .split(";")
        .map((part) => part.trim());
      const type = rawType.toLowerCase();
      let quality = 1;

      for (const parameter of rawParameters) {
        const [rawName, rawValue] = parameter
          .split("=", 2)
          .map((part) => part.trim());
        if (rawName?.toLowerCase() !== "q") {
          continue;
        }
        const parsed = Number(rawValue);
        quality = Number.isFinite(parsed)
          ? Math.max(0, Math.min(1, parsed))
          : 0;
      }

      const specificity = specificityFor(type);
      return { position, quality, specificity, type };
    })
    .filter(({ type }) => MEDIA_TYPE_PATTERN.test(type));

const matches = (entry: AcceptEntry, candidate: Representation) => {
  if (entry.type === "*/*") {
    return true;
  }
  if (entry.type.endsWith("/*")) {
    return candidate.startsWith(entry.type.slice(0, -1));
  }
  return entry.type === candidate;
};

export const preferredRepresentation = (
  header: string | null
): Representation | null => {
  if (!header) {
    return "text/html";
  }

  const entries = parseAccept(header);
  if (entries.length === 0) {
    return "text/html";
  }

  let best:
    | { position: number; quality: number; representation: Representation }
    | undefined;

  for (const representation of REPRESENTATIONS) {
    const match = entries
      .filter((entry) => matches(entry, representation))
      .sort(
        (left, right) =>
          right.specificity - left.specificity || left.position - right.position
      )[0];

    if (!match || match.quality <= 0) {
      continue;
    }

    if (
      !best ||
      match.quality > best.quality ||
      (match.quality === best.quality && match.position < best.position)
    ) {
      best = {
        position: match.position,
        quality: match.quality,
        representation,
      };
    }
  }

  return best?.representation ?? null;
};

export const appendVary = (existing: string | null, token: string) => {
  if (!existing) {
    return token;
  }

  const tokens = existing.split(",").map((value) => value.trim().toLowerCase());
  return tokens.includes(token.toLowerCase())
    ? existing
    : `${existing}, ${token}`;
};

const MARKDOWN_ALTERNATES = new Map([
  ["/", "/index.md"],
  ["/about", "/about.md"],
  ["/contact", "/contact.md"],
  ["/privacy", "/privacy.md"],
]);

export const markdownAlternateFor = (pathname: string) =>
  MARKDOWN_ALTERNATES.get(pathname);
