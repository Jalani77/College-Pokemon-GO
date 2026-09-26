"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import {
  Aperture, ArrowUpRight, Check, ChevronRight, Clock3, Compass, Crosshair, Heart,
  Leaf, LoaderCircle, LocateFixed, Map as MapIcon, Plus, RefreshCw,
  ScanLine, Sparkles, Sunrise, Upload, Users, X, Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DiscoveryCard, FieldSuggestion, GroupEvent, LocationQuest, SurroundingsTarget } from "@/lib/types";
import { matchDemoCard, type DemoCard } from "@/lib/demoCards";
import CardFace, { cardPalette } from "@/components/CardFace";
import TearSeal from "@/components/TearSeal";

const CampusMap = dynamic(() => import("@/components/CampusMap"), {
  ssr: false,
  loading: () => <div className="map-loading"><LoaderCircle size={20} className="spin" /> Preparing map</div>,
});

type AppTab = "explore" | "map" | "deck" | "community";
type StorageMode = "loading" | "mongodb" | "local-demo" | "unavailable";
type OwnedCard = DiscoveryCard & { wishlist?: boolean };
type AppEvent = GroupEvent & { demo?: boolean };
type Reveal = {
  card: OwnedCard;
  ticket?: string;
  demoCard?: DemoCard | null;
  subjectType?: "object" | "person" | "scene";
  unlocked?: boolean;
  alreadySaved?: boolean;
};
type Toast = { message: string; tone?: "error" | "success" };

const NAV_ITEMS: { id: AppTab; label: string; Icon: typeof Compass }[] = [
  { id: "explore", label: "Explore", Icon: Aperture },
  { id: "map", label: "Map", Icon: MapIcon },
  { id: "deck", label: "Deck", Icon: Leaf },
  { id: "community", label: "People", Icon: Users },
];

const LOCAL_KEYS = {
  cards: "outside.demo.cards.v1",
  locations: "outside.demo.locations.v1",
  events: "outside.demo.events.v1",
  wanted: "outside.demo.wishlist.v1",
  profile: "outside.demo.profile.v1",
};

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

async function jsonOrError<T>(response: Response): Promise<T & { error?: string }> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data as T & { error?: string };
}

function makeGuestId() {
  return window.crypto.randomUUID();
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not prepare this photo."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Could not compress this photo."));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read this photo."));
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.72);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be opened as an image."));
    };
    image.src = url;
  });
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<AppTab>("explore");
  const [guestId, setGuestId] = useState("");
  const [storageMode, setStorageMode] = useState<StorageMode>("loading");
  const [serviceError, setServiceError] = useState("");
  const [visionConfigured, setVisionConfigured] = useState<boolean | null>(null);
  const [cards, setCards] = useState<OwnedCard[]>([]);
  const [locations, setLocations] = useState<LocationQuest[]>([]);
  const [gpsPosition, setGpsPosition] = useState<[number, number] | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"unrequested" | "locating" | "located" | "unavailable">("unrequested");
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [wishlistMatches, setWishlistMatches] = useState<{ name: string; displayName: string }[]>([]);
  const [wantedBy, setWantedBy] = useState<string[]>([]);
  const [wantedByLoading, setWantedByLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [visibilityOptIn, setVisibilityOptIn] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [fieldScanMode, setFieldScanMode] = useState(false);
  const [fieldSuggestions, setFieldSuggestions] = useState<FieldSuggestion[]>([]);
  const [surroundingsMode, setSurroundingsMode] = useState(false);
  const [surroundingsFrame, setSurroundingsFrame] = useState("");
  const [surroundingsTargets, setSurroundingsTargets] = useState<SurroundingsTarget[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<SurroundingsTarget | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [presenterMode, setPresenterMode] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [showQuestForm, setShowQuestForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [questAcknowledged, setQuestAcknowledged] = useState(false);
  const [questFields, setQuestFields] = useState({ name: "", clue: "", cardName: "", cardCategory: "", verifiedFact: "", lat: "", lng: "" });
  const [eventFields, setEventFields] = useState({ title: "", description: "", meetingPoint: "", startsAt: "", rewardCard: "", organizer: "" });
  const [adminToken, setAdminToken] = useState("");
  const [wantedInput, setWantedInput] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const savingCardRef = useRef(false);
  const timingRef = useRef({ captureStart: 0 });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    const listener = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    let id = window.localStorage.getItem("outside.guestId");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = makeGuestId();
      window.localStorage.setItem("outside.guestId", id);
    }
    setGuestId(id);
  }, []);

  useEffect(() => {
    if (!guestId) return;
    let cancelled = false;

    async function load() {
      try {
        const status = await fetch("/api/status").then((response) => jsonOrError<{ storage: string; visionConfigured: boolean }>(response));
        if (cancelled) return;
        setVisionConfigured(status.visionConfigured);
        if (status.storage === "local-demo") {
          if (cancelled) return;
          setCards(readLocal<OwnedCard[]>(LOCAL_KEYS.cards, []));
          setLocations(readLocal<LocationQuest[]>(LOCAL_KEYS.locations, []));
          setEvents(readLocal<AppEvent[]>(LOCAL_KEYS.events, []));
          setLookingFor(readLocal<string[]>(LOCAL_KEYS.wanted, []));
          const profile = readLocal<{ displayName: string; visibilityOptIn: boolean }>(LOCAL_KEYS.profile, { displayName: "", visibilityOptIn: false });
          setDisplayName(profile.displayName);
          setVisibilityOptIn(profile.visibilityOptIn);
          setStorageMode("local-demo");
          return;
        }

        const [deckResponse, locationResponse, eventResponse, wishlistResponse] = await Promise.all([
          fetch(`/api/deck?guestId=${encodeURIComponent(guestId)}`),
          fetch("/api/locations"),
          fetch("/api/events"),
          fetch(`/api/wishlist?guestId=${encodeURIComponent(guestId)}`),
        ]);
        const [deck, locationData, eventData, wishlist] = await Promise.all([
          deckResponse.json(), locationResponse.json(), eventResponse.json(), wishlistResponse.json(),
        ]);
        const failedIndex = [deckResponse, locationResponse, eventResponse, wishlistResponse].findIndex((response) => !response.ok);
        if (failedIndex >= 0) {
          const failedData = [deck, locationData, eventData, wishlist][failedIndex];
          throw new Error(failedData.error || "MongoDB is unavailable. Saved content was not replaced with demo data.");
        }
        if (cancelled) return;
        setCards(deck.cards || []);
        setLocations(locationData.locations || []);
        setEvents(eventData.events || []);
        setLookingFor(wishlist.names || []);
        setWishlistMatches(wishlist.matches || []);
        setDisplayName(wishlist.displayName || "");
        setVisibilityOptIn(Boolean(wishlist.visibilityOptIn));
        setStorageMode("mongodb");
      } catch (error) {
        if (cancelled) return;
        setStorageMode("unavailable");
        const message = error instanceof Error ? error.message : "Could not connect to the app services.";
        setServiceError(message);
        setToast({ message, tone: "error" });
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [guestId]);

  useEffect(() => {
    if (activeTab !== "explore") return;
    let cancelled = false;
    setVideoReady(false);
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not available in this browser. Upload a photo to try discovery.");
      return;
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => setCameraError("Tap retry to start the camera preview."));
        }
      })
      .catch((error: DOMException) => {
        if (cancelled) return;
        const denied = error.name === "NotAllowedError" || error.name === "SecurityError";
        setCameraError(denied
          ? "Camera permission was denied. Allow camera access in your browser settings, or upload a photo instead."
          : "No camera was found. Upload a photo to try discovery.");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [activeTab, cameraAttempt]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!reveal?.alreadySaved || !guestId || storageMode === "loading") return;
    if (storageMode !== "mongodb") {
      setWantedBy([]);
      return;
    }
    let cancelled = false;
    setWantedByLoading(true);
    fetch(`/api/wishlist?guestId=${encodeURIComponent(guestId)}&cardName=${encodeURIComponent(reveal.card.name)}&cardCategory=${encodeURIComponent(reveal.card.category)}`)
      .then((response) => jsonOrError<{ wantedBy: { displayName: string; matchType: "card" | "category" }[] }>(response))
      .then((data) => { if (!cancelled) setWantedBy(data.wantedBy.map((match) => `${match.displayName} · ${match.matchType === "card" ? "wants this card" : `wants ${reveal.card.category}`}`)); })
      .catch(() => { if (!cancelled) setWantedBy([]); })
      .finally(() => { if (!cancelled) setWantedByLoading(false); });
    return () => { cancelled = true; };
  }, [reveal?.alreadySaved, reveal?.card.name, reveal?.card.category, guestId, storageMode]);

  function handleVideoReady() {
    setVideoReady(true);
    setCameraError("");
  }

  function handleUnlock() {
    setReveal((current) => (current ? { ...current, unlocked: true } : current));
  }

  async function recognize(imageData: string, focusLabel?: string) {
    if (!guestId) return;
    setBusy(true);
    setToast(null);
    try {
      const result = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId, imageData, focusLabel }),
      }).then((response) => jsonOrError<{ card: OwnedCard; ticket: string; recognition: { uncertain: boolean; subjectType: "object" | "person" | "scene" } }>(response));
      const recognizedAt = performance.now();
      if (timingRef.current.captureStart) console.info(`[timing] capture -> recognition: ${Math.round(recognizedAt - timingRef.current.captureStart)}ms`);
      const demoCard = matchDemoCard(result.card.name, result.recognition.subjectType);
      setReveal({ card: result.card, ticket: result.ticket, subjectType: result.recognition.subjectType, demoCard, unlocked: false });
      console.info(`[timing] recognition -> reveal: ${Math.round(performance.now() - recognizedAt)}ms`);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Could not identify this photo.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function scanFieldFrame(imageData: string) {
    setBusy(true);
    setFieldSuggestions([]);
    setToast(null);
    try {
      const result = await fetch("/api/field-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      }).then((response) => jsonOrError<{ suggestions: FieldSuggestion[] }>(response));
      setFieldSuggestions(result.suggestions);
      if (!result.suggestions.length) setToast({ message: "No clear discovery prompts in that frame. Try another view.", tone: "error" });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Field scan failed. Retry with another frame.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function scanSurroundingsFrame(imageData: string) {
    setBusy(true);
    setSurroundingsFrame(imageData);
    setSurroundingsTargets([]);
    setFieldSuggestions([]);
    setSelectedTarget(null);
    setToast(null);
    try {
      const result = await fetch("/api/scan-surroundings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      }).then((response) => jsonOrError<{ targets: SurroundingsTarget[] }>(response));
      setSurroundingsTargets(result.targets);
      if (!result.targets.length) setToast({ message: "No clear non-person objects in that frame. You can scan again or capture anything.", tone: "error" });
    } catch (error) {
      setSurroundingsFrame("");
      setToast({ message: error instanceof Error ? error.message : "Could not scan this frame. Retry or capture anything.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function capture(mode: "anything" | "surroundings" = "anything") {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraError("Wait for the camera preview or upload a photo.");
      return;
    }
    setCaptureFlash(true);
    window.setTimeout(() => setCaptureFlash(false), 220);
    timingRef.current.captureStart = performance.now();
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return setToast({ message: "Could not capture this frame.", tone: "error" });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return setToast({ message: "Could not compress this frame.", tone: "error" });
      const reader = new FileReader();
      reader.onload = () => {
        const imageData = String(reader.result);
        if (mode === "surroundings") void scanSurroundingsFrame(imageData);
        else if (fieldScanMode) void scanFieldFrame(imageData);
        else void recognize(imageData, selectedTarget?.name);
      };
      reader.onerror = () => setToast({ message: "Could not read this frame.", tone: "error" });
      reader.readAsDataURL(blob);
    }, "image/jpeg", 0.72);
  }

  async function handleUpload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setToast({ message: "Choose a photo file to discover.", tone: "error" });
    if (file.size > 16 * 1024 * 1024) return setToast({ message: "Choose a photo under 16 MB.", tone: "error" });
    setBusy(true);
    timingRef.current.captureStart = performance.now();
    try {
      const compressed = await compressImage(file);
      if (surroundingsMode) await scanSurroundingsFrame(compressed);
      else if (fieldScanMode) await scanFieldFrame(compressed);
      else await recognize(compressed, selectedTarget?.name);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Could not open this photo.", tone: "error" });
      setBusy(false);
    }
  }

  function beginSurroundingsScan() {
    setSurroundingsMode(true);
    setFieldScanMode(false);
    setSurroundingsFrame("");
    setSurroundingsTargets([]);
    setSelectedTarget(null);
    void capture("surroundings");
  }

  function continueWithTarget(target: SurroundingsTarget) {
    setSelectedTarget(target);
    setSurroundingsMode(false);
    setSurroundingsFrame("");
    setSurroundingsTargets([]);
  }

  function captureAnything() {
    setSelectedTarget(null);
    setSurroundingsMode(false);
    setSurroundingsFrame("");
    setSurroundingsTargets([]);
    setFieldScanMode(false);
    void capture("anything");
  }

  function storeLocalCard(card: OwnedCard) {
    const nextCards = [card, ...readLocal<OwnedCard[]>(LOCAL_KEYS.cards, []).filter((saved) => saved.id !== card.id)];
    writeLocal(LOCAL_KEYS.cards, nextCards);
    setCards(nextCards);
  }

  async function saveCard() {
    if (!reveal) return;
    if (reveal.alreadySaved) {
      setReveal(null);
      setActiveTab("deck");
      setToast({ message: "Quest discovery is saved in your deck.", tone: "success" });
      return;
    }
    if (storageMode === "unavailable" || storageMode === "loading") {
      return setToast({ message: "Storage is not ready. Check the service status and try again.", tone: "error" });
    }
    if (storageMode === "local-demo" || reveal.card.source === "local-demo") {
      storeLocalCard({ ...reveal.card, source: "local-demo" });
      setReveal(null);
      setToast({ message: "Saved on this device only. Local demo card: no XP awarded.", tone: "success" });
      return;
    }
    if (!reveal.unlocked) return setToast({ message: "Unlock the card before saving it.", tone: "error" });
    if (!reveal.ticket) return setToast({ message: "This card has no valid recognition ticket. Discover it again.", tone: "error" });
    if (savingCardRef.current) return;
    savingCardRef.current = true;
    setSavingCard(true);
    try {
      await fetch("/api/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId, ticket: reveal.ticket }),
      }).then((response) => jsonOrError<{ card: OwnedCard }>(response));
      const result = await fetch(`/api/deck?guestId=${encodeURIComponent(guestId)}`).then((response) => jsonOrError<{ cards: OwnedCard[] }>(response));
      const savedCard = result.cards.find((card) => card.id === reveal.card.id);
      if (!savedCard) throw new Error("Save was acknowledged, but the card was not found in the refreshed deck.");
      setCards(result.cards);
      setReveal({ ...reveal, card: savedCard, alreadySaved: true });
      setToast({ message: "Discovery saved to your deck.", tone: "success" });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Could not save this card.", tone: "error" });
    } finally {
      savingCardRef.current = false;
      setSavingCard(false);
    }
  }

  async function claimQuest(location: LocationQuest) {
    if (!guestId) return;
    if (cards.some((card) => card.questId === location.id)) return setToast({ message: "This quest is already in your deck.", tone: "error" });
    if (location.demo || storageMode === "local-demo") {
      const card: OwnedCard = {
        id: `local-${location.id}`,
        name: location.cardName,
        category: location.cardCategory,
        shortFact: location.verifiedFact,
        rarity: "common",
        xp: 0,
        source: "local-demo",
        discoveredAt: new Date().toISOString(),
        questId: location.id,
      };
      storeLocalCard(card);
      setReveal({ card, alreadySaved: true, unlocked: true });
      return;
    }
    try {
      const result = await fetch("/api/locations/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId, locationId: location.id }),
      }).then((response) => jsonOrError<{ card: OwnedCard }>(response));
      await refreshDeck();
      setReveal({ card: result.card, alreadySaved: true, unlocked: true });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Could not claim this quest.", tone: "error" });
    }
  }

  async function refreshDeck() {
    if (!guestId) return;
    const response = await fetch(`/api/deck?guestId=${encodeURIComponent(guestId)}`).then((item) => jsonOrError<{ cards: OwnedCard[] }>(item));
    setCards(response.cards);
  }

  function startFieldScan() {
    setFieldSuggestions([]);
    setFieldScanMode(true);
    setActiveTab("explore");
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setGpsStatus("unavailable");
      return;
    }
    setGpsStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsPosition([position.coords.latitude, position.coords.longitude]);
        setGpsStatus("located");
      },
      () => {
        setGpsPosition(null);
        setGpsStatus("unavailable");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 },
    );
  }

  async function createQuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quest: LocationQuest = {
      id: window.crypto.randomUUID(),
      name: questFields.name.trim(),
      clue: questFields.clue.trim(),
      cardName: questFields.cardName.trim(),
      cardCategory: questFields.cardCategory.trim(),
      verifiedFact: questFields.verifiedFact.trim(),
      lat: Number(questFields.lat),
      lng: Number(questFields.lng),
    };
    if (storageMode === "local-demo") {
      if (!questAcknowledged) return setToast({ message: "Confirm that you are the organizer and have verified these details.", tone: "error" });
      quest.demo = true;
      const next = [quest, ...locations];
      writeLocal(LOCAL_KEYS.locations, next);
      setLocations(next);
      setShowQuestForm(false);
      setQuestAcknowledged(false);
      setToast({ message: "Local demo quest added on this device. It is not a published campus location.", tone: "success" });
      return;
    }
    if (storageMode !== "mongodb") return setToast({ message: "Connect MongoDB before publishing verified quests.", tone: "error" });
    try {
      const result = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
        body: JSON.stringify(quest),
      }).then((response) => jsonOrError<{ location: LocationQuest }>(response));
      setLocations((current) => [result.location, ...current]);
      setShowQuestForm(false);
      setAdminToken("");
      setToast({ message: "Verified quest published.", tone: "success" });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Could not publish quest.", tone: "error" });
    }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const eventTime = new Date(eventFields.startsAt);
    if (!Number.isFinite(eventTime.getTime()) || eventTime.getTime() <= Date.now()) {
      return setToast({ message: "Choose a real date and time in the future.", tone: "error" });
    }
    const payload = { ...eventFields, startsAt: eventTime.toISOString() };
    if (storageMode === "local-demo") {
      if (!questAcknowledged) return setToast({ message: "Confirm that this event and meeting point are real and organizer-approved.", tone: "error" });
      const item: AppEvent = { ...payload, id: window.crypto.randomUUID(), attendees: [], demo: true };
      const next = [item, ...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      writeLocal(LOCAL_KEYS.events, next);
      setEvents(next);
      setShowEventForm(false);
      setQuestAcknowledged(false);
      setToast({ message: "Local demo group quest created on this device only.", tone: "success" });
      return;
    }
    if (storageMode !== "mongodb") return setToast({ message: "Connect MongoDB before publishing a group quest.", tone: "error" });
    try {
      const result = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
        body: JSON.stringify(payload),
      }).then((response) => jsonOrError<{ event: AppEvent }>(response));
      setEvents((current) => [...current, result.event].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setShowEventForm(false);
      setAdminToken("");
      setToast({ message: "Group quest scheduled.", tone: "success" });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Could not schedule group quest.", tone: "error" });
    }
  }

  async function joinEvent(item: AppEvent) {
    if (item.attendees.includes(guestId)) return;
    if (item.demo || storageMode === "local-demo") {
      const next = events.map((event) => event.id === item.id ? { ...event, attendees: [...event.attendees, guestId] } : event);
      writeLocal(LOCAL_KEYS.events, next);
      setEvents(next);
      return;
    }
    try {
      await fetch(`/api/events/${encodeURIComponent(item.id)}/join`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestId }),
      }).then((response) => jsonOrError(response));
      setEvents((current) => current.map((event) => event.id === item.id ? { ...event, attendees: [...event.attendees, guestId] } : event));
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Could not join this quest.", tone: "error" });
    }
  }

  async function toggleCardWishlist(card: OwnedCard) {
    const wishlist = !card.wishlist;
    if (storageMode === "mongodb") {
      try {
        await fetch(`/api/deck/${encodeURIComponent(card.id)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestId, wishlist }),
        }).then((response) => jsonOrError(response));
      } catch (error) {
        return setToast({ message: error instanceof Error ? error.message : "Could not update this card.", tone: "error" });
      }
    } else if (storageMode === "local-demo") {
      const next = cards.map((saved) => saved.id === card.id ? { ...saved, wishlist } : saved);
      writeLocal(LOCAL_KEYS.cards, next);
    } else {
      return setToast({ message: "Storage is unavailable.", tone: "error" });
    }
    setCards((current) => current.map((saved) => saved.id === card.id ? { ...saved, wishlist } : saved));
  }

  async function addWantedCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = wantedInput.trim();
    if (!name) return;
    if (storageMode === "mongodb") {
      try {
        await fetch("/api/wishlist", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestId, cardName: name, action: "add" }),
        }).then((response) => jsonOrError(response));
        const data = await fetch(`/api/wishlist?guestId=${encodeURIComponent(guestId)}`).then((response) => jsonOrError<{ names: string[]; matches: typeof wishlistMatches }>(response));
        setLookingFor(data.names);
        setWishlistMatches(data.matches);
      } catch (error) {
        return setToast({ message: error instanceof Error ? error.message : "Could not update your wishlist.", tone: "error" });
      }
    } else if (storageMode === "local-demo") {
      const next = Array.from(new Set([...lookingFor, name]));
      writeLocal(LOCAL_KEYS.wanted, next);
      setLookingFor(next);
    } else {
      return setToast({ message: "Storage is unavailable.", tone: "error" });
    }
    setWantedInput("");
  }

  async function removeWantedCard(name: string) {
    if (storageMode === "mongodb") {
      try {
        await fetch("/api/wishlist", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestId, cardName: name, action: "remove" }),
        }).then((response) => jsonOrError(response));
        const data = await fetch(`/api/wishlist?guestId=${encodeURIComponent(guestId)}`).then((response) => jsonOrError<{ names: string[]; matches: typeof wishlistMatches }>(response));
        setLookingFor(data.names);
        setWishlistMatches(data.matches);
      } catch (error) {
        setToast({ message: error instanceof Error ? error.message : "Could not remove this card.", tone: "error" });
      }
      return;
    }
    const next = lookingFor.filter((card) => card !== name);
    writeLocal(LOCAL_KEYS.wanted, next);
    setLookingFor(next);
  }

  async function saveWishlistProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (visibilityOptIn && !displayName.trim()) return setToast({ message: "Choose the display name people will see before opting in.", tone: "error" });
    if (storageMode === "mongodb") {
      try {
        await fetch("/api/wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestId, action: "profile", displayName, visibilityOptIn }),
        }).then((response) => jsonOrError(response));
        const data = await fetch(`/api/wishlist?guestId=${encodeURIComponent(guestId)}`).then((response) => jsonOrError<{ matches: typeof wishlistMatches }>(response));
        setWishlistMatches(data.matches);
        setToast({ message: "Wishlist visibility preference saved.", tone: "success" });
      } catch (error) {
        setToast({ message: error instanceof Error ? error.message : "Could not save visibility preference.", tone: "error" });
      }
      return;
    }
    if (storageMode === "local-demo") {
      writeLocal(LOCAL_KEYS.profile, { displayName: displayName.trim(), visibilityOptIn });
      setToast({ message: "Saved on this device only. No other explorers can see it in local demo mode.", tone: "success" });
      return;
    }
    setToast({ message: "Storage is unavailable.", tone: "error" });
  }

  const xp = cards.reduce((total, card) => total + (card.xp || 0), 0);
  const level = Math.floor(xp / 100) + 1;
  const nextLevelProgress = xp % 100;
  const claimedIds = cards.flatMap((card) => card.questId ? [card.questId] : []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="wordmark" aria-label="Outside home" onClick={() => setActiveTab("explore")}>
          <span className="wordmark-mark"><span /></span>
          <span>outside<span className="wordmark-period">.</span></span>
        </button>
        <div className="topbar-right">
          <span className={`connection-pill connection-pill--${storageMode}`}>
            <span className="connection-dot" />
            {storageMode === "mongodb" ? "SYNCED" : storageMode === "local-demo" ? "LOCAL DEMO" : storageMode === "loading" ? "CONNECTING" : "OFFLINE"}
          </span>
          <button className="level-chip" onClick={() => setActiveTab("deck")} aria-label={`Level ${level}, ${xp} XP`}>
            <span className="level-mark">{level}</span><span>{xp} XP</span>
          </button>
        </div>
      </header>

      <div className="content-area">
        {activeTab === "explore" && (
          <section className="explore-view" aria-label="Explore">
            <div className="camera-stage">
              <video ref={videoRef} className={`camera-feed ${videoReady ? "camera-feed--live" : ""}`} autoPlay playsInline muted onLoadedMetadata={handleVideoReady} />
              <div className="camera-grain" aria-hidden="true" />
              <div className="camera-vignette" aria-hidden="true" />
              <div className={`camera-flash ${captureFlash ? "camera-flash--active" : ""}`} aria-hidden="true" />
              <div className="camera-topline">
                <div className="camera-live-label"><span className="live-dot" /> {videoReady ? "CAMERA LIVE" : "READY WHEN YOU ARE"}</div>
                {presenterMode && <span className="field-mode-chip presenter-badge">PRESENTER MODE</span>}
                {fieldScanMode && <button className="field-mode-chip" onClick={() => { setFieldScanMode(false); setFieldSuggestions([]); }}>FIELD SCAN · EXIT</button>}
                {surroundingsMode && !surroundingsFrame && <button className="field-mode-chip" onClick={() => setSurroundingsMode(false)}>SCAN · EXIT</button>}
              </div>

              {!videoReady && !busy && (
                <div className="camera-empty">
                  <div className="camera-empty-icon"><Aperture size={25} strokeWidth={1.5} /></div>
                  <h1>{cameraError ? "Camera unavailable" : "Starting camera"}</h1>
                  {cameraError && <p className="camera-error">{cameraError}</p>}
                  {cameraError && <button className="text-button camera-retry" onClick={() => { setCameraError(""); setCameraAttempt((attempt) => attempt + 1); }}><RefreshCw size={14} /> Retry camera</button>}
                  {cameraError && <button className="upload-fallback" onClick={() => uploadRef.current?.click()}><Upload size={15} /> Choose a photo</button>}
                </div>
              )}

              {busy && <div className="recognizing-scrim"><div className="recognizing-orbit"><span /><span /><span /></div><span>SCANNING…</span><small>Real xAI recognition in progress on this still frame.</small></div>}

              {surroundingsFrame && <div className="surroundings-review">
                <Image src={surroundingsFrame} alt="Captured surroundings frame for object review" fill unoptimized sizes="100vw" className="surroundings-image" />
                <div className="surroundings-review-shade" />
                <div className="surroundings-targets">
                  <span className="eyebrow">OBJECTS IN THIS FRAME · NOT LIVE TRACKING</span>
                  {busy && <span className="surroundings-loading"><LoaderCircle size={14} className="spin" /> Looking for clear objects…</span>}
                  {!busy && surroundingsTargets.length === 0 && <span className="surroundings-empty">No clear object labels. Try another frame or capture anything.</span>}
                  <div className="surroundings-chip-list">{surroundingsTargets.map((target, index) => <button className={`surroundings-chip ${selectedTarget?.name === target.name ? "surroundings-chip--selected" : ""}`} key={`${target.name}-${index}`} onClick={() => continueWithTarget(target)}><Crosshair size={15} /><span><strong>{target.name}</strong><small>{target.category} · {target.observation}</small></span><ChevronRight size={15} /></button>)}</div>
                  <button className="capture-anything-link" onClick={captureAnything}>Capture anything instead <ArrowUpRight size={14} /></button>
                </div>
              </div>}

              {fieldSuggestions.length > 0 && <div className="field-suggestions-panel"><span className="eyebrow">AI IDEAS FROM THIS FRAME · NOT VERIFIED PINS</span>{fieldSuggestions.map((suggestion, index) => <div className="field-suggestion" key={`${suggestion.name}-${index}`}><span>{suggestion.category}</span><strong>{suggestion.name}</strong><small>{suggestion.clue}</small></div>)}</div>}

              {selectedTarget && <div className="focus-chip"><Crosshair size={14} /><span>Focus: <strong>{selectedTarget.name}</strong></span><button onClick={() => setSelectedTarget(null)} aria-label="Clear selected object"><X size={14} /></button></div>}

              <div className="camera-bottom">
                <div className="camera-actions">
                  <button className="surroundings-action" onClick={beginSurroundingsScan} disabled={busy || !videoReady} aria-label="Scan surroundings"><ScanLine size={17} /><span>Scan surroundings</span></button>
                  <input ref={uploadRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => { void handleUpload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  <button className={`shutter ${busy ? "shutter--busy" : ""}`} onClick={() => void capture()} disabled={busy || !videoReady} aria-label={selectedTarget ? `Capture ${selectedTarget.name}` : "Capture anything"}>
                    <span className="shutter-ring">{busy ? <LoaderCircle size={24} className="spin" /> : <Aperture size={25} strokeWidth={1.7} />}</span>
                    <span className="shutter-label">{busy ? "SCANNING" : selectedTarget ? "CAPTURE TARGET" : "CAPTURE NOW"}</span>
                  </button>
                  <button className="capture-upload" onClick={() => uploadRef.current?.click()} disabled={busy} aria-label={presenterMode ? "Presenter images: choose a photo" : "Upload a photo"}><Upload size={18} /><span>{presenterMode ? "Presenter photo" : "Upload"}</span></button>
                </div>
                <button className="presenter-toggle" onClick={() => setPresenterMode((value) => !value)} aria-pressed={presenterMode}>{presenterMode ? "Exit presenter images" : "Presenter images (for judges)"}</button>
                  {visionConfigured === false && <small className="ai-status">AI NOT CONFIGURED</small>}
              </div>
            </div>

            <div className="explore-caption">
              <div><span className="eyebrow">AN EXCUSE TO WANDER</span><p>Small things make a place yours.</p></div>
              <button className="circle-link" onClick={() => setActiveTab("deck")} aria-label="Open your deck"><ArrowUpRight size={20} /></button>
            </div>
          </section>
        )}

        {activeTab === "map" && (
          <section className="page-section map-view">
            <div className="section-heading">
              <span className="eyebrow"><LocateFixed size={13} /> THE CAMPUS, RE-MAPPED</span>
              <div className="heading-line"><h1>Go find it.</h1><div className="map-actions"><button className="pill-action" onClick={locateMe} disabled={gpsStatus === "locating"}><LocateFixed size={15} /> {gpsStatus === "locating" ? "Locating" : "My location"}</button><button className="pill-action" onClick={startFieldScan}><Aperture size={15} /> Field Scan</button></div></div>
              <p>Explore freely. Optional quests are organizer-verified; Field Scan ideas come only from a frame you choose.</p>
            </div>

            {storageMode === "local-demo" && <div className="demo-banner"><span>LOCAL DEMO</span> Quest pins and claims stay on this device. Nothing here is a real campus landmark.</div>}
            {storageMode === "unavailable" && <div className="error-banner">MongoDB is unreachable. Existing campus quest data is unavailable.</div>}

            {showQuestForm && (
              <form className="editor-panel" onSubmit={(event) => void createQuest(event)}>
                <div className="editor-heading"><div><span className="eyebrow">ORGANIZER TOOL</span><h2>Add a verified discovery</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setShowQuestForm(false)}><X size={18} /></button></div>
                <p className="editor-note">Enter a real place, accurate clue, and a fact you have verified. No locations or facts are prefilled.</p>
                <label>Location name<input required minLength={3} maxLength={100} value={questFields.name} onChange={(event) => setQuestFields({ ...questFields, name: event.target.value })} placeholder="Organizer-verified location" /></label>
                <label>Clue<textarea required minLength={8} maxLength={220} value={questFields.clue} onChange={(event) => setQuestFields({ ...questFields, clue: event.target.value })} placeholder="How should someone find it?" rows={2} /></label>
                <div className="form-pair"><label>Reward card<input required value={questFields.cardName} onChange={(event) => setQuestFields({ ...questFields, cardName: event.target.value })} placeholder="Object name" /></label><label>Category<input required value={questFields.cardCategory} onChange={(event) => setQuestFields({ ...questFields, cardCategory: event.target.value })} placeholder="e.g. Architecture" /></label></div>
                <label>Verified fact<textarea required minLength={12} maxLength={240} value={questFields.verifiedFact} onChange={(event) => setQuestFields({ ...questFields, verifiedFact: event.target.value })} placeholder="A short fact the organizer has checked" rows={2} /></label>
                <div className="form-pair"><label>Latitude<input required type="number" min="-90" max="90" step="any" value={questFields.lat} onChange={(event) => setQuestFields({ ...questFields, lat: event.target.value })} placeholder="Real coordinates" /></label><label>Longitude<input required type="number" min="-180" max="180" step="any" value={questFields.lng} onChange={(event) => setQuestFields({ ...questFields, lng: event.target.value })} placeholder="Real coordinates" /></label></div>
                {storageMode === "mongodb" && <label>Organizer token<input required type="password" autoComplete="off" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="ADMIN_TOKEN" /></label>}
                {storageMode === "local-demo" && <label className="check-line"><input type="checkbox" checked={questAcknowledged} onChange={(event) => setQuestAcknowledged(event.target.checked)} /> I am the organizer and have checked these details.</label>}
                <button className="primary-button" type="submit"><Check size={16} /> {storageMode === "local-demo" ? "Add local demo quest" : "Publish verified quest"}</button>
              </form>
            )}

            <div className="map-frame"><CampusMap locations={locations} onClaim={(location) => void claimQuest(location)} claimedIds={claimedIds} gpsPosition={gpsPosition} /><span className="map-location-label">{gpsStatus === "located" ? "YOUR LOCATION · THIS SESSION ONLY" : gpsStatus === "unavailable" ? "LOCATION UNAVAILABLE · DEMO AREA" : "DEMO AREA · LOCATION NOT SHARED"}</span></div>

            <div className="quest-list"><div className="list-title"><span className="eyebrow">VERIFIED ORGANIZER QUESTS</span><span>{locations.length} PIN{locations.length === 1 ? "" : "S"}</span></div>{locations.length ? locations.map((location) => <button className="quest-row" key={location.id} onClick={() => void claimQuest(location)}><span className="quest-row-marker"><LocateFixed size={17} /></span><span className="quest-row-text"><strong>{location.name}</strong><small>{location.clue}</small></span><span className="quest-row-card">{claimedIds.includes(location.id) ? <Check size={17} /> : <ChevronRight size={17} />}</span></button>) : <p className="quiet-empty">No verified quests yet. Free photo discoveries work anywhere.</p>}</div>
          </section>
        )}

        {activeTab === "deck" && (
          <section className="page-section deck-view">
            <div className="section-heading deck-heading">
              <span className="eyebrow"><Leaf size={13} /> YOUR POCKET FIELD GUIDE</span>
              <div className="heading-line"><h1>The things<br className="mobile-break" /> you found.</h1><div className="deck-count"><span>{cards.length.toString().padStart(2, "0")}</span><small>IN YOUR<br />DECK</small></div></div>
              <p>Every card starts with looking up.</p>
            </div>
            {storageMode === "local-demo" && <div className="demo-banner"><span>LOCAL DEMO</span> These cards are stored in this browser only. Clear site data and they are gone.</div>}
            {storageMode === "unavailable" && <div className="error-banner"><strong>Your saved deck could not be loaded.</strong> {serviceError || "Check MongoDB and refresh to try again."}</div>}
            <div className="level-progress"><div className="level-label"><span><Zap size={14} /> LEVEL {level} WANDERER</span><strong>{xp} <small>XP</small></strong></div><div className="progress-track"><span style={{ width: `${nextLevelProgress}%` }} /></div><span className="progress-caption">{100 - nextLevelProgress} XP TO LEVEL {level + 1}</span></div>
            {cards.length === 0 ? (
              <div className="deck-empty"><div className="empty-specimen"><span className="specimen-orbit specimen-orbit--one" /><span className="specimen-orbit specimen-orbit--two" /><Sparkles size={24} /></div><span className="eyebrow">NOTHING IN HERE. YET.</span><h2>Your first find is waiting.</h2><p>Take a photo of something you notice. Your pocket field guide starts with the ordinary.</p><button className="primary-button" onClick={() => setActiveTab("explore")}><Aperture size={16} /> Find your first card</button></div>
            ) : (
              <div className="card-grid">{cards.map((card, index) => <article className="deck-card" key={card.id} style={{ animationDelay: `${index * 70}ms` }}>
                  <button className="card-face-button" onClick={() => setReveal({ card, alreadySaved: true, unlocked: true })} aria-label={`View ${card.name}`}>
                    <CardFace card={card} demoCard={matchDemoCard(card.name, "object")} index={index + 1} variant="thumb" />
                  </button>
                  <span className="deck-card-meta">{new Date(card.discoveredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {sourceLabel(card.source)}</span>
                <button className={`heart-button ${card.wishlist ? "heart-button--saved" : ""}`} onClick={() => void toggleCardWishlist(card)} aria-label={card.wishlist ? "Remove from saved cards" : "Save card to wishlist"} title={card.wishlist ? "Remove from saved cards" : "Save card to wishlist"}><Heart size={17} fill={card.wishlist ? "currentColor" : "none"} /></button>
              </article>)}</div>
            )}
          </section>
        )}

        {activeTab === "community" && (
          <section className="page-section community-view">
            <div className="section-heading">
              <span className="eyebrow"><Users size={13} /> BETTER OUT THERE TOGETHER</span>
              <div className="heading-line"><h1>Find your people.</h1><span className="community-sun"><Sunrise size={22} /></span></div>
              <p>Make plans to wander. Nobody is here until they actually sign up.</p>
            </div>
            {storageMode === "local-demo" && <div className="demo-banner"><span>LOCAL DEMO</span> Looking-for notes and event RSVPs are visible only in this browser.</div>}

            <div className="community-section wishlist-section">
              <div className="subsection-heading"><div><span className="eyebrow">ON YOUR RADAR</span><h2>Cards you&apos;re after.</h2></div><span className="subsection-number">01</span></div>
              <p className="section-copy">Post a card you&apos;re looking for. Only explorers who opt in with a chosen display name appear in matches.</p>
              <form className="wanted-form" onSubmit={(event) => void addWantedCard(event)}><input aria-label="Card you are looking for" value={wantedInput} onChange={(event) => setWantedInput(event.target.value)} placeholder="Type a card name..." maxLength={80} /><button type="submit" disabled={!wantedInput.trim()} aria-label="Add to looking-for list"><Plus size={18} /></button></form>
              {lookingFor.length > 0 ? <div className="wanted-list">{lookingFor.map((name) => <div className="wanted-item" key={name}><span><Heart size={15} />{name}</span><button className="text-button" onClick={() => void removeWantedCard(name)}>Remove</button></div>)}</div> : <p className="quiet-empty">No cards on your list yet.</p>}
              {storageMode === "mongodb" && wishlistMatches.length > 0 && <div className="match-list"><span className="eyebrow">OPTED-IN EXPLORERS</span>{wishlistMatches.map((match, index) => <div key={`${match.displayName}-${match.name}-${index}`}><Users size={15} /><span>{match.displayName}</span><strong>{match.name}</strong></div>)}</div>}
              {storageMode === "mongodb" && lookingFor.length > 0 && wishlistMatches.length === 0 && <p className="quiet-empty match-empty">No opted-in explorer has posted those cards yet.</p>}
              {storageMode === "local-demo" && lookingFor.length > 0 && <p className="quiet-empty match-empty">This device is in local demo mode, so no other explorers can see this list.</p>}
            </div>

            <div className="community-section visibility-section">
              <div className="subsection-heading"><div><span className="eyebrow">YOUR PRIVACY</span><h2>Wishlist visibility.</h2></div><span className="subsection-number">02</span></div>
              <p className="section-copy">Your display name is shown only when someone views a card you want. Guest ID, contact details, and location stay private.</p>
              <form className="profile-form" onSubmit={(event) => void saveWishlistProfile(event)}>
                <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} placeholder="Name other explorers can see" /></label>
                <label className="check-line"><input type="checkbox" checked={visibilityOptIn} onChange={(event) => setVisibilityOptIn(event.target.checked)} /> Let other explorers see my name when our card lists match.</label>
                <button className="secondary-button" type="submit"><Check size={15} /> Save privacy choice</button>
              </form>
              {storageMode === "local-demo" && <p className="quiet-empty">Local demo preferences stay on this device and are not shared.</p>}
            </div>

            <div className="community-section events-section">
              <div className="subsection-heading"><div><span className="eyebrow">A REASON TO MEET UP</span><h2>Group quests.</h2></div><button className="pill-action" onClick={() => { setShowEventForm(!showEventForm); setQuestAcknowledged(false); }}><Plus size={15} /> Host one</button></div>
              <p className="section-copy">One real plan, a real meeting point, and a reward picked by its organizer.</p>
              {showEventForm && <form className="editor-panel event-editor" onSubmit={(event) => void createEvent(event)}>
                <div className="editor-heading"><div><span className="eyebrow">ORGANIZER TOOL</span><h2>Host a group quest</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setShowEventForm(false)}><X size={18} /></button></div>
                <label>Quest title<input required minLength={4} value={eventFields.title} onChange={(event) => setEventFields({ ...eventFields, title: event.target.value })} placeholder="A real plan for your crew" /></label>
                <label>What are you doing?<textarea required minLength={12} maxLength={260} value={eventFields.description} onChange={(event) => setEventFields({ ...eventFields, description: event.target.value })} placeholder="A short description" rows={2} /></label>
                <label>Meeting point<input required value={eventFields.meetingPoint} onChange={(event) => setEventFields({ ...eventFields, meetingPoint: event.target.value })} placeholder="Real place people can meet" /></label>
                <label>Date &amp; time<input required type="datetime-local" min={new Date().toISOString().slice(0, 16)} value={eventFields.startsAt} onChange={(event) => setEventFields({ ...eventFields, startsAt: event.target.value })} /></label>
                <div className="form-pair"><label>Reward card<input required value={eventFields.rewardCard} onChange={(event) => setEventFields({ ...eventFields, rewardCard: event.target.value })} placeholder="Organizer-chosen card" /></label><label>Organizer<input required maxLength={40} value={eventFields.organizer} onChange={(event) => setEventFields({ ...eventFields, organizer: event.target.value })} placeholder="Name" /></label></div>
                {storageMode === "mongodb" && <label>Organizer token<input required type="password" autoComplete="off" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="ADMIN_TOKEN" /></label>}
                {storageMode === "local-demo" && <label className="check-line"><input type="checkbox" checked={questAcknowledged} onChange={(event) => setQuestAcknowledged(event.target.checked)} /> I&apos;m organizing this real plan and meeting point.</label>}
                <button className="primary-button" type="submit"><Check size={16} /> {storageMode === "local-demo" ? "Add local demo group quest" : "Schedule group quest"}</button>
              </form>}

              {events.length === 0 ? <div className="events-empty"><span className="event-empty-mark"><Clock3 size={22} /></span><div><strong>No group quests scheduled.</strong><p>When an organizer adds a date and meeting point, it will show up here.</p></div></div> : <div className="event-list">{events.map((item) => {
                const joined = item.attendees.includes(guestId);
                return <article className="event-card" key={item.id}>
                  <div className="event-date"><span>{new Date(item.startsAt).toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</span><strong>{new Date(item.startsAt).getDate()}</strong><small>{new Date(item.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</small></div>
                  <div className="event-details"><div className="event-title-row"><span className="eyebrow">{item.demo ? "LOCAL DEMO QUEST" : "GROUP QUEST"}</span><span className="attendee-count"><Users size={13} /> {item.attendees.length}</span></div><h3>{item.title}</h3><p>{item.description}</p><div className="event-meta"><span><LocateFixed size={13} />{item.meetingPoint}</span><span><Sparkles size={13} />{item.rewardCard}</span></div><div className="event-footer"><span>Hosted by {item.organizer}</span><button className={`rsvp-button ${joined ? "rsvp-button--joined" : ""}`} onClick={() => void joinEvent(item)} disabled={joined}>{joined ? <><Check size={14} /> You&apos;re in</> : <>Join in <ArrowUpRight size={14} /></>}</button></div></div>
                </article>;
              })}</div>}
            </div>
          </section>
        )}
      </div>

      <nav className="bottom-nav" aria-label="Main navigation">{NAV_ITEMS.map(({ id, label, Icon }) => <button key={id} onClick={() => setActiveTab(id)} className={`nav-item ${activeTab === id ? "nav-item--active" : ""}`} aria-current={activeTab === id ? "page" : undefined}><span className="nav-icon-wrap"><Icon size={19} strokeWidth={activeTab === id ? 2.2 : 1.7} />{id === "deck" && cards.length > 0 && <span className="nav-count" />}</span><span>{label}</span></button>)}</nav>

      {toast && <div role="status" className={`toast ${toast.tone === "error" ? "toast--error" : "toast--success"}`}><span>{toast.tone === "error" ? "OOPS" : "NICE FIND"}</span><p>{toast.message}</p><button className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss"><X size={16} /></button></div>}

      {reveal && <div className="reveal-backdrop" role="presentation" onClick={() => setReveal(null)}><section className="reveal-dialog" role="dialog" aria-modal="true" aria-labelledby="reveal-title" aria-busy={savingCard} onClick={(event) => event.stopPropagation()}>
        <button className="reveal-close" onClick={() => setReveal(null)} aria-label="Close card"><X size={19} /></button>
        <div className="reveal-status">
          <span className="reveal-status-kicker">{reveal.alreadySaved ? sourceLabel(reveal.card.source) : "RECOGNIZED"}</span>
          <h2 id="reveal-title" className="reveal-status-title">{reveal.card.name}</h2>
          {reveal.card.uncertaintyNote && <p className="reveal-uncertainty"><strong>Uncertain —</strong> {reveal.card.uncertaintyNote} <button className="text-button" onClick={() => { setReveal(null); setActiveTab("explore"); }}>Try another photo <RefreshCw size={13} /></button></p>}
          {reveal.card.source === "local-demo" && <p className="demo-card-note">Device-only test card. No verified campus data or XP is claimed.</p>}
        </div>
        <TearSeal accent={cardPalette(reveal.card.category, reveal.demoCard).accent} ink={cardPalette(reveal.card.category, reveal.demoCard).ink} reducedMotion={reducedMotion} unlocked={Boolean(reveal.unlocked)} onUnlock={handleUnlock}>
          <CardFace card={reveal.card} demoCard={reveal.demoCard} index={cards.length + 1} variant="reveal" />
        </TearSeal>
        {reveal.unlocked && <div className="reveal-actions">
          {reveal.alreadySaved ? <>
            <div className="saved-banner"><Check size={15} /> Saved to Deck</div>
            {storageMode === "local-demo" ? <p className="wanted-empty-line">Local demo mode has no shared wishlist.</p> : wantedByLoading ? <span className="wanted-loading"><LoaderCircle size={13} className="spin" /> Checking wishlists…</span> : wantedBy.length ? <div className="wanted-chip-row">{wantedBy.map((name, index) => <span className="wanted-chip" key={`${name}-${index}`}><Users size={12} />{name}</span>)}</div> : <p className="wanted-empty-line">No opted-in wishlist matches yet.</p>}
          </> : <button className="primary-button reveal-save" onClick={() => void saveCard()} disabled={savingCard || storageMode === "unavailable" || storageMode === "loading"}><Check size={17} /> {savingCard ? "Saving…" : reveal.card.source === "local-demo" || storageMode === "local-demo" ? "Save demo card" : "Save to deck"}</button>}
        </div>}
      </section></div>}
    </main>
  );
}

function sourceLabel(source: DiscoveryCard["source"]) {
  if (source === "verified-quest") return "ORGANIZER VERIFIED";
  if (source === "local-demo") return "DEVICE-ONLY DEMO";
  return "AI-GENERATED";
}