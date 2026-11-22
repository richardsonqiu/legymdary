/**
 * App navigation: 5 bottom tabs, each a group of related pages shown as
 * sub-tabs at the top. A page belongs to the group whose `match` prefixes it.
 */
export type NavGroup = {
  key: string;
  label: string;
  href: string;
  match: string[];
  tabs: { href: string; label: string }[];
};

export const NAV: NavGroup[] = [
  { key: "home", label: "Home", href: "/dashboard", match: ["/dashboard"], tabs: [] },
  {
    key: "train",
    label: "Train",
    href: "/log",
    match: ["/log", "/history", "/exercises", "/activities"],
    tabs: [
      { href: "/log", label: "Workout" },
      { href: "/history", label: "History" },
      { href: "/exercises", label: "Exercises" },
    ],
  },
  {
    key: "food",
    label: "Food",
    href: "/food",
    match: ["/food"],
    tabs: [],
  },
  {
    key: "progress",
    label: "Progress",
    href: "/stats",
    match: ["/stats", "/plan", "/prs", "/recap"],
    tabs: [
      { href: "/stats", label: "Body" },
      { href: "/plan", label: "Goal" },
      { href: "/prs", label: "PRs" },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    href: "/insights",
    match: ["/insights"],
    tabs: [],
  },
];

/**
 * Connections: watches, scales and files that bring data in or out. Not a
 * bottom tab (it's set-up you visit now and then); reached from Home's
 * account menu, Insights, History and the Today guide.
 */
export const CONNECT: NavGroup = {
  key: "connect",
  label: "Connections",
  href: "/connect",
  match: ["/connect", "/garmin", "/apple-health"],
  tabs: [
    { href: "/connect", label: "All" },
    { href: "/garmin", label: "Garmin" },
    { href: "/apple-health", label: "Apple" },
    { href: "/connect/import", label: "File" },
  ],
};

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

export function navGroupFor(path: string): NavGroup | undefined {
  return [...NAV, CONNECT].find((g) => g.match.some((m) => under(path, m)));
}
