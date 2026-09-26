import type { Rarity } from "@/lib/types";

export type DemoCardId = "apple" | "soccer-ball" | "backpack";

export type DemoCard = {
  id: DemoCardId;
  /** Recognition labels/synonyms that are permitted to match this card. Matched as whole words against the recognized subject only. */
  labels: string[];
  /** Words that must NOT appear in the recognized subject, even if a label also matches (avoids brand/shape confusion). */
  excludeLabels: string[];
  assetPath: string;
  title: string;
  category: string;
  /** Curated fact for the physical demo object. Always shown labeled as curated, never presented as the AI's own claim. */
  fact: string;
  factIsVerified: boolean;
  rarity: Rarity;
  palette: { accent: string; accentSoft: string; ink: string; paper: string };
  alt: string;
};

export const DEMO_CARDS: DemoCard[] = [
  {
    id: "apple",
    labels: ["apple", "red apple", "green apple"],
    excludeLabels: ["iphone", "macbook", "ipad", "laptop", "phone", "watch", "logo", "pie", "juice", "cider"],
    assetPath: "/cards/apple.svg",
    title: "Apple",
    category: "Fruit",
    fact: "A fresh apple is mostly water and floats because roughly a quarter of its volume is air pockets in the flesh.",
    factIsVerified: true,
    rarity: "common",
    palette: { accent: "#d1372b", accentSoft: "#f7c9b8", ink: "#3a140d", paper: "#fff4ec" },
    alt: "Illustrated red apple with a curled green leaf and a bold diagonal highlight",
  },
  {
    id: "soccer-ball",
    labels: ["soccer ball", "football", "soccer", "futbol"],
    excludeLabels: ["american football", "basketball", "volleyball", "tennis ball", "baseball", "rugby ball", "helmet", "nfl"],
    assetPath: "/cards/soccer-ball.svg",
    title: "Soccer ball",
    category: "Sports gear",
    fact: "The classic black-and-white panel pattern was designed to help players and TV cameras track the ball more easily.",
    factIsVerified: true,
    rarity: "common",
    palette: { accent: "#1c6b4f", accentSoft: "#bfe6d3", ink: "#0c2620", paper: "#eefaf4" },
    alt: "Illustrated black-and-white soccer ball with pentagon panels and a green motion arc",
  },
  {
    id: "backpack",
    labels: ["backpack", "rucksack", "school bag", "bookbag", "knapsack"],
    excludeLabels: ["handbag", "purse", "suitcase", "briefcase", "duffel", "tote"],
    assetPath: "/cards/backpack.svg",
    title: "Backpack",
    category: "Everyday gear",
    fact: "Padded shoulder straps distribute weight across the whole strap width, which is why worn or twisted straps make a pack feel heavier.",
    factIsVerified: true,
    rarity: "common",
    palette: { accent: "#d97a1f", accentSoft: "#f6d9ab", ink: "#241a0c", paper: "#fff6e8" },
    alt: "Illustrated navy backpack with tan straps and an orange zipper pull",
  },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWord(haystack: string, phrase: string) {
  return new RegExp(`\\b${escapeRegExp(phrase.toLowerCase())}\\b`, "i").test(haystack);
}

/**
 * Matches a real recognized subject to one of the three curated demo cards.
 * Only checks the actual recognized object name (not category/color/shape words),
 * and only when the subject is not a person. Returns null on any ambiguity.
 */
export function matchDemoCard(objectName: string, subjectType: "object" | "person" | "scene"): DemoCard | null {
  if (subjectType === "person") return null;
  const name = objectName.toLowerCase().trim();
  if (!name) return null;
  for (const card of DEMO_CARDS) {
    if (card.excludeLabels.some((word) => containsWord(name, word))) continue;
    if (card.labels.some((label) => containsWord(name, label))) return card;
  }
  return null;
}
