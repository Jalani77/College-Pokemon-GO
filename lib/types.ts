export type Rarity = "common" | "uncommon" | "rare" | "event";

export type DiscoveryCard = {
  id: string;
  name: string;
  category: string;
  shortFact: string;
  rarity: Rarity;
  xp: number;
  source: "ai" | "verified-quest" | "local-demo";
  uncertaintyNote?: string;
  discoveredAt: string;
  questId?: string;
  imageData?: string;
};

export type LocationQuest = {
  id: string;
  name: string;
  clue: string;
  cardName: string;
  cardCategory: string;
  verifiedFact: string;
  lat: number;
  lng: number;
  createdAt?: string;
  demo?: boolean;
};

export type GroupEvent = {
  id: string;
  title: string;
  description: string;
  meetingPoint: string;
  startsAt: string;
  rewardCard: string;
  organizer: string;
  attendees: string[];
};

export type Recognition = {
  objectName: string;
  category: string;
  shortFact: string;
  confidence: number;
  uncertaintyNote: string;
};