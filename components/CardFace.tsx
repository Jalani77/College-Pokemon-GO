"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { Bird, Building2, Leaf, Package, Palette, Signpost, Users, Zap } from "lucide-react";
import type { DiscoveryCard } from "@/lib/types";
import type { DemoCard } from "@/lib/demoCards";

type FaceCard = Pick<DiscoveryCard, "name" | "category" | "shortFact" | "rarity" | "xp" | "artworkData" | "artworkKind">;

const ACCENT_GROUPS: Record<string, { accent: string; accentSoft: string; ink: string; paper: string }> = {
  moss: { accent: "#2f7a3f", accentSoft: "#cfe8d2", ink: "#132615", paper: "#f3faf3" },
  brick: { accent: "#b4552e", accentSoft: "#f0d3c1", ink: "#331708", paper: "#fdf4ee" },
  ink: { accent: "#3a4560", accentSoft: "#d6dae6", ink: "#161a26", paper: "#f4f5f9" },
  sun: { accent: "#c98a1f", accentSoft: "#f3e2b4", ink: "#2c1f06", paper: "#fdf8ec" },
};

function accentGroup(category: string) {
  const value = category.toLowerCase();
  if (/plant|nature|tree|flower/.test(value)) return "moss";
  if (/build|architecture|structure/.test(value)) return "brick";
  if (/art|sign|object|uncertain/.test(value)) return "ink";
  return "sun";
}

function categoryIcon(category: string) {
  const value = category.toLowerCase();
  if (/plant|nature|tree|flower/.test(value)) return Leaf;
  if (/build|architecture|structure/.test(value)) return Building2;
  if (/bird|animal|wildlife/.test(value)) return Bird;
  if (/sign/.test(value)) return Signpost;
  if (/art/.test(value)) return Palette;
  if (/person|people|human/.test(value)) return Users;
  return Package;
}

export function cardPalette(category: string, demoCard?: DemoCard | null) {
  return demoCard?.palette || ACCENT_GROUPS[accentGroup(category)];
}

export default function CardFace({ card, demoCard, index, variant }: {
  card: FaceCard;
  demoCard?: DemoCard | null;
  index?: number;
  variant: "thumb" | "reveal";
}) {
  const palette = cardPalette(card.category, demoCard);
  const Icon = categoryIcon(card.category);
  const style = {
    "--card-accent": palette.accent,
    "--card-accent-soft": palette.accentSoft,
    "--card-ink": palette.ink,
    "--card-paper": palette.paper,
  } as CSSProperties;

  return (
    <div className={`card-face card-face--${variant}`} style={style}>
      <span className="card-face-motion" aria-hidden="true" />
      <div className="card-face-art">
        {demoCard ? (
          <Image src={demoCard.assetPath} alt={demoCard.alt} width={640} height={800} unoptimized className="card-face-img" priority={variant === "reveal"} />
        ) : card.artworkData ? (
          <Image src={card.artworkData} alt={`Illustrated ${card.name} card artwork`} width={800} height={702} unoptimized className="card-face-img" />
        ) : (
          <span className="card-face-icon-fallback"><Icon size={variant === "reveal" ? 96 : 54} strokeWidth={1.2} /></span>
        )}
      </div>
      <span className="card-face-index">No. {String(index ?? 1).padStart(2, "0")}</span>
      <span className="card-face-rarity-chip">{card.rarity}</span>
      <div className="card-face-info">
        <span className="card-face-category">{demoCard?.category || card.category}</span>
        <h3 className="card-face-title">{card.name}</h3>
        {variant === "reveal" && (
          <p className="card-face-fact">
            {demoCard ? <span className="card-face-fact-tag">{demoCard.factIsVerified ? "CURATED FACT" : "CURATED NOTE"}</span> : null}
            {demoCard ? demoCard.fact : card.shortFact}
          </p>
        )}
        <span className="card-face-xp"><Zap size={13} /> {card.xp} XP</span>
      </div>
    </div>
  );
}
