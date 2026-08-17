import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Animated,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
  useWindowDimensions,
} from "react-native";
import type { MediaItem as Media, MediaKind as Kind } from "./src/types/media";
import { getBookRecommendations, getGameRecommendations, getTitleDetails, getTrendingMedia, searchMedia } from "./src/services/media";
import { disableDailyReccoReminder, enableDailyReccoReminder, getReminderEnabled } from "./src/services/reminders";
import {
  ensureGuestSession,
  completeAccountRedirect,
  addMediaToCollection,
  createCollection,
  getAccountState,
  loadCollections,
  loadSharedCollection,
  loadEpisodeReviews,
  loadMediaReview,
  loadMediaStates,
  loadSwipeHistory,
  loadTasteProfile,
  seedTasteProfile,
  saveEpisodeReview,
  saveMediaReview,
  requestAccountUpgrade,
  setCollectionVisibility,
  type Collection,
  syncMediaState,
  syncSwipeAction,
  type TasteAction,
} from "./src/services/supabase";

type Tab = "Home" | "Discover" | "Search" | "Library" | "Profile";
type TrackingMeta = { bookProgress?: number; watchedOn?: string; rewatch?: boolean };
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const RECCO_MARK = require("./assets/recco-mark-v1.png");
const kindIcon: Record<Kind, keyof typeof Ionicons.glyphMap> = {
  FILM: "film-outline",
  SHOW: "tv-outline",
  BOOK: "book-outline",
  ALBUM: "musical-notes-outline",
  GAME: "game-controller-outline",
};
const kindName: Record<Kind, string> = {
  FILM: "Film",
  SHOW: "Series",
  BOOK: "Book",
  ALBUM: "Album",
  GAME: "Game",
};
const kindAccent: Record<Kind, string> = {
  FILM: "#51D4F4",
  SHOW: "#B9A4FF",
  BOOK: "#FF9B70",
  ALBUM: "#73E0A8",
  GAME: "#D7E86B",
};
const tasteVibes = ["Escapist", "Intense", "Comfort", "Cerebral", "Tender"];

function shortTitle(title: string, limit = 27) {
  if (title.length <= limit) return title;
  const trimmed = title.slice(0, limit - 1).replace(/\s+\S*$/, "");
  return `${trimmed || title.slice(0, limit - 1)}…`;
}

function Tap({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: object;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <AnimatedPressable
      style={[style, { transform: [{ scale }] }]}
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(scale, {
          toValue: 0.97,
          useNativeDriver: true,
          speed: 36,
          bounciness: 5,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 22,
          bounciness: 7,
        }).start()
      }
    >
      {children}
    </AnimatedPressable>
  );
}

function Brand({ inverse = false, compact = false }: { inverse?: boolean; compact?: boolean }) {
  return (
    <View style={styles.brandLockup}>
      <Image source={RECCO_MARK} style={[styles.brandMark, compact && styles.brandMarkCompact]} />
      {!compact && <Text style={[styles.brand, inverse && styles.brandInverse]}>Recco</Text>}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ReccoApp />
    </SafeAreaProvider>
  );
}

function ReccoApp() {
  const insets = useSafeAreaInsets();
  const lastBackPress = useRef(0);
  const pageTransition = useRef(new Animated.Value(1)).current;
  const [tab, setTab] = useState<Tab>("Home");
  const [selected, setSelected] = useState<Media | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [tracked, setTracked] = useState<string[]>([]);
  const [rating, setRating] = useState<Record<string, number>>({});
  const [libraryItems, setLibraryItems] = useState<Record<string, Media>>({});
  const [completed, setCompleted] = useState<string[]>([]);
  const [episodeProgress, setEpisodeProgress] = useState<Record<string, boolean>>({});
  const [trackingMeta, setTrackingMeta] = useState<Record<string, TrackingMeta>>({});
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [searchKind, setSearchKind] = useState<"FILM" | "SHOW" | "BOOK" | "GAME">("FILM");
  const [filter, setFilter] = useState<"ALL" | Kind>("ALL");
  const [remoteResults, setRemoteResults] = useState<Media[]>([]);
  const [trending, setTrending] = useState<Media[]>([]);
  const [books, setBooks] = useState<Media[]>([]);
  const [games, setGames] = useState<Media[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [searching, setSearching] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [curating, setCurating] = useState(false);
  const [tasteWeights, setTasteWeights] = useState<Record<string, number>>({});
  const [libraryFilter, setLibraryFilter] = useState<"ALL" | "SAVED" | "TRACKING" | "FINISHED">("ALL");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [account, setAccount] = useState<{ email: string | null; isAnonymous: boolean }>({ email: null, isAnonymous: true });
  const [accountEmailInput, setAccountEmailInput] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionDraft, setCollectionDraft] = useState("");
  const [collectionMessage, setCollectionMessage] = useState("");
  const [sharedCollection, setSharedCollection] = useState<{ title: string; description: string; items: Media[] } | null>(null);
  const buzz = () =>
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
  const open = (item: Media) => {
    buzz();
    setLibraryItems((items) => ({ ...items, [item.id]: item }));
    setSelected(item);
  };
  const findItem = (id: string) =>
    selected?.id === id
      ? selected
      : libraryItems[id] ?? trending.find((item) => item.id === id) ?? books.find((item) => item.id === id) ?? games.find((item) => item.id === id);
  const save = (id: string) => {
    buzz();
    setSaved((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
    const item = findItem(id);
    if (item) setLibraryItems((items) => ({ ...items, [item.id]: item }));
    if (item) void syncMediaState(item, "SAVED", { rating: rating[id] }).catch(() => undefined);
  };
  const track = (id: string) => {
    buzz();
    setTracked((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
    const item = findItem(id);
    if (item) setLibraryItems((items) => ({ ...items, [item.id]: item }));
    if (item)
      void syncMediaState(item, "IN_PROGRESS", { rating: rating[id] }).catch(
        () => undefined,
      );
  };
  const liveCatalog = [...trending, ...books, ...games];
  const swipeItems = useMemo(
    () => trending.flatMap((entry, index) => [entry, books[index], games[index]].filter(Boolean) as Media[]),
    [trending, books, games],
  );
  const allShelfItems = Object.values(libraryItems).filter(
    (item) => saved.includes(item.id) || tracked.includes(item.id) || completed.includes(item.id),
  );
  const shelfItems = allShelfItems.filter((item) =>
    libraryFilter === "SAVED"
      ? saved.includes(item.id) && !tracked.includes(item.id)
      : libraryFilter === "TRACKING"
        ? tracked.includes(item.id)
        : libraryFilter === "FINISHED"
          ? completed.includes(item.id)
          : saved.includes(item.id) || tracked.includes(item.id) || completed.includes(item.id),
  );
  const trackingItems = allShelfItems.filter((item) => tracked.includes(item.id));
  const results = useMemo(
    () =>
      liveCatalog.filter(
        (item) =>
          (filter === "ALL" || item.kind === filter) &&
          `${item.title} ${item.by}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [filter, query, liveCatalog],
  );
  const bookQueryFromTaste = (weights: Record<string, number>) => {
    const [feature] = Object.entries(weights)
      .filter(([name, value]) => !name.startsWith("kind:") && value > 0)
      .sort(([, left], [, right]) => right - left)[0] ?? [];
    return feature || "subject:fiction";
  };
  useEffect(() => {
    void ensureGuestSession()
      .then(async () => {
        const [states, taste] = await Promise.all([loadMediaStates(), loadTasteProfile()]);
        return { states, taste };
      })
      .then(({ states, taste }) => {
        setTasteWeights(taste);
        if (!states.length) return getBookRecommendations(bookQueryFromTaste(taste));
        setLibraryItems(Object.fromEntries(states.map((state) => [state.media_id, {
          id: state.media_id,
          kind: state.metadata.kind ?? state.media_kind,
          title: state.metadata.title ?? state.title,
          by: state.metadata.by ?? (state.media_kind === "SHOW" ? "TV series" : state.media_kind === "BOOK" ? "Book" : state.media_kind === "GAME" ? "Game" : "Film"),
          year: state.metadata.year ?? "",
          image: state.metadata.image ?? state.image_url ?? "",
          note: state.metadata.note ?? "",
          score: state.metadata.score,
          genres: state.metadata.genres,
        }])));
        setSaved(states.filter((state) => state.status === "SAVED").map((state) => state.media_id));
        setTracked(states.filter((state) => state.status === "IN_PROGRESS").map((state) => state.media_id));
        setCompleted(states.filter((state) => state.status === "COMPLETED").map((state) => state.media_id));
        setRating(Object.fromEntries(states.filter((state) => state.rating).map((state) => [state.media_id, state.rating ?? 0])));
        setEpisodeProgress(Object.assign({}, ...states.map((state) => state.progress ?? {})));
        setTrackingMeta(Object.fromEntries(states.map((state) => [state.media_id, state.metadata.tracking ?? {}])));
        return getBookRecommendations(bookQueryFromTaste(taste));
      })
      .then((liveBooks) => liveBooks && setBooks(liveBooks))
      .catch(() => undefined);
    void getTrendingMedia()
      .then((liveTitles) => {
        setTrending(liveTitles);
        setCatalogError(false);
      })
      .catch(() => setCatalogError(true))
      .finally(() => setCatalogLoading(false));
    void getGameRecommendations().then(setGames).catch(() => undefined);
  }, []);
  useEffect(() => {
    void loadCollections().then(setCollections).catch(() => undefined);
  }, []);
  useEffect(() => {
    void getReminderEnabled().then(setReminderEnabled).catch(() => undefined);
  }, []);
  useEffect(() => {
    const refreshAccount = () => void getAccountState().then(setAccount).catch(() => undefined);
    const handleUrl = ({ url }: { url: string }) => {
      const collectionToken = /^recco:\/\/collection\/([0-9a-f-]+)$/i.exec(url)?.[1];
      if (collectionToken) {
        void loadSharedCollection(collectionToken).then(setSharedCollection).catch(() => undefined);
        return;
      }
      void completeAccountRedirect(url).then((completed) => {
        if (completed) {
          refreshAccount();
          setAccountMessage("Your archive is now secured to this account.");
        }
      }).catch(() => setAccountMessage("That link could not be completed. Request a new one from Profile."));
    };
    refreshAccount();
    void Linking.getInitialURL().then((url) => url && handleUrl({ url }));
    const subscription = Linking.addEventListener("url", handleUrl);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    AsyncStorage.getItem("recco-library-v1")
      .then((raw) => {
        if (!raw) return;
        const data = JSON.parse(raw) as {
          saved?: string[];
          tracked?: string[];
          rating?: Record<string, number>;
          completed?: string[];
          episodeProgress?: Record<string, boolean>;
          trackingMeta?: Record<string, TrackingMeta>;
          libraryItems?: Record<string, Media>;
        };
        setSaved(data.saved ?? []);
        setTracked(data.tracked ?? []);
        setRating(data.rating ?? {});
        setCompleted(data.completed ?? []);
        setEpisodeProgress(data.episodeProgress ?? {});
        setTrackingMeta(data.trackingMeta ?? {});
        setLibraryItems(data.libraryItems ?? {});
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);
  useEffect(() => {
    AsyncStorage.getItem("recco-onboarded-v2")
      .then((value) => setOnboarding(!value))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(
      "recco-library-v1",
      JSON.stringify({ saved, tracked, rating, completed, episodeProgress, trackingMeta, libraryItems }),
    );
  }, [saved, tracked, rating, completed, episodeProgress, trackingMeta, libraryItems, hydrated]);
  useEffect(() => {
    if (query.trim().length < 2) {
      setRemoteResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    const timeout = setTimeout(() => {
      setSearching(true);
      searchMedia(query, searchKind)
        .then((items) => {
          if (active) setRemoteResults(items);
        })
        .catch(() => {
          if (active) setRemoteResults([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, searchKind]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selected) {
        setSelected(null);
        return true;
      }
      if (curating) {
        setCurating(false);
        return true;
      }
      if (onboarding) {
        setOnboarding(false);
        return true;
      }
      if (tab !== "Home") {
        setTab("Home");
        return true;
      }
      const now = Date.now();
      if (now - lastBackPress.current < 2000) return false;
      lastBackPress.current = now;
      if (Platform.OS === "android") {
        ToastAndroid.show("Press back again to exit Recco", ToastAndroid.SHORT);
      }
      return true;
    });
    return () => subscription.remove();
  }, [curating, onboarding, selected, tab]);
  useEffect(() => {
    pageTransition.setValue(0);
    Animated.timing(pageTransition, {
      toValue: 1,
      duration: 210,
      useNativeDriver: true,
    }).start();
  }, [pageTransition, tab]);

  const Header = ({ label }: { label?: string }) => (
    <View style={styles.header}>
      <Brand />
      {label ? (
        <Text style={styles.headerLabel}>{label}</Text>
      ) : (
        <Tap onPress={() => setTab("Search")} style={styles.headerAction}>
          <Ionicons name="search" size={19} color={C.ink} />
        </Tap>
      )}
    </View>
  );
  const Poster = ({ item, wide = false }: { item: Media; wide?: boolean }) => (
    <Tap
      onPress={() => open(item)}
      style={wide ? styles.wideCard : styles.posterCard}
    >
      <Image
        source={{ uri: item.image }}
        style={wide ? styles.wideImage : styles.poster}
      />
      <View style={[styles.posterTypeRail, { backgroundColor: kindAccent[item.kind] }]} />
      <LinearGradient
        colors={["transparent", "rgba(6,10,9,.92)"]}
        style={styles.posterShade}
      />
      <View style={styles.posterInfo}>
        <View style={styles.kindBadge}>
          <Ionicons name={kindIcon[item.kind]} size={10} color={kindAccent[item.kind]} />
          <Text style={[styles.mediaKind, { color: kindAccent[item.kind] }]}>{kindName[item.kind]}</Text>
        </View>
        <Text
          numberOfLines={1}
          style={wide ? styles.wideTitle : styles.posterTitle}
        >
          {shortTitle(item.title, wide ? 34 : 21)}
        </Text>
        {wide && (
          <Text style={styles.wideMeta}>
            {item.by} · {item.year}
          </Text>
        )}
      </View>
    </Tap>
  );
  const Section = ({
    title,
    action,
    children,
  }: {
    title: string;
    action?: string;
    children: React.ReactNode;
  }) => (
    <View style={styles.section}>
      <View style={styles.sectionTop}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action && <Text style={styles.sectionAction}>{action}</Text>}
      </View>
      {children}
    </View>
  );

  const heroItem = trending[0];
  const tasteLeaders = Object.entries(tasteWeights)
    .filter(([feature, weight]) => !feature.startsWith("kind:") && !feature.startsWith("vibe:") && weight > 0)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 3)
    .map(([feature]) => feature);
  const Home = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      <Header />
      {heroItem ? <Tap onPress={() => open(heroItem)} style={styles.hero}>
        <Image source={{ uri: heroItem.image }} style={styles.heroImage} />
        <LinearGradient
          colors={["rgba(8,13,12,.12)", "rgba(8,13,12,.96)"]}
          style={styles.heroShade}
        />
        <Image source={RECCO_MARK} style={styles.heroMark} />
        <View style={styles.heroTop}>
          <Text style={styles.heroEyebrow}>TONIGHT, FOR YOU</Text>
          <View style={styles.match}>
            <Ionicons name="sparkles" size={12} color={C.ink} />
            <Text style={styles.matchText}>TASTE MATCH</Text>
          </View>
        </View>
        <View style={styles.heroBottom}>
          <Text numberOfLines={2} style={styles.heroTitle}>{shortTitle(heroItem.title, 42)}</Text>
          <Text style={styles.heroBody}>
            {heroItem.note || "A live pick shaped around the stories you keep."}
          </Text>
          <View style={styles.heroButton}>
            <Text style={styles.heroButtonText}>Explore the Recco</Text>
            <Ionicons name="arrow-forward" size={16} color={C.ink} />
          </View>
        </View>
      </Tap> : (
        <View style={styles.homeCatalogState}>
          <Ionicons name={catalogError ? "cloud-offline-outline" : "sparkles-outline"} size={30} color={C.teal} />
          <Text style={styles.emptyTitle}>{catalogLoading ? "Loading live picks" : "Live picks are unavailable"}</Text>
          <Text style={styles.emptyText}>{catalogError ? "Check your connection and reopen Recco to load the live catalog." : "Fetching films, series, and books for you."}</Text>
        </View>
      )}
      <Tap onPress={() => setCurating(true)} style={styles.tastePulse}>
        <View style={styles.tastePulseCopy}>
          <Text style={styles.heroEyebrow}>YOUR TASTE, LIVE</Text>
          <Text style={styles.tastePulseTitle}>
            {tasteLeaders.length ? tasteLeaders.join(" · ") : "Start with a feeling, not a filter."}
          </Text>
          <Text style={styles.tastePulseText}>Your saves, ratings and swipe signals shape every next pick.</Text>
        </View>
        <View style={styles.tasteOrbit}>
          <View style={styles.tasteOrbitInner} />
          <View style={styles.tasteOrbitDot} />
          <Ionicons name="sparkles" size={18} color={C.ink} />
        </View>
      </Tap>
      <Section title={trackingItems.length ? "Continue tracking" : "Start tracking"} action="VIEW LIBRARY">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {(trackingItems.length ? trackingItems : trending.slice(1, 4)).map(
            (item) => (
              <View key={item.id}>
                <Poster item={item} />
                <Text numberOfLines={1} style={styles.railTitle}>
                  {shortTitle(item.title, 23)}
                </Text>
                <Text style={styles.railMeta}>{item.by}</Text>
                <View style={styles.progress}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: item.kind === "SHOW" ? "62%" : "44%" },
                    ]}
                  />
                </View>
              </View>
            ),
          )}
        </ScrollView>
      </Section>
      {heroItem && books[0] && (
        <Section title="Across your worlds">
          <Tap onPress={() => open(books[0])} style={styles.crossMediaCard}>
            <Image source={{ uri: heroItem.image }} style={styles.crossMediaPoster} />
            <View style={styles.crossMediaRule} />
            <Image source={{ uri: books[0].image }} style={styles.crossMediaPoster} />
            <View style={styles.crossMediaCopy}>
              <Text style={styles.heroEyebrow}>ONE TASTE · TWO FORMATS</Text>
              <Text numberOfLines={2} style={styles.crossMediaTitle}>If {shortTitle(heroItem.title, 22)} pulls you in, read {shortTitle(books[0].title, 25)} next.</Text>
              <Text style={styles.crossMediaMeta}>A cross-media Recco, tuned by your signals.</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={C.teal} />
          </Tap>
        </Section>
      )}
      <Section title="For tonight">
        <View style={styles.wall}>
          {trending.slice(4, 8).map(
            (item) => (
              <Poster item={item} key={item.id} />
            ),
          )}
        </View>
      </Section>
      {books.length > 0 && (
        <Section title="Books for you">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            {books.slice(0, 6).map((item) => (
              <View key={item.id}>
                <Poster item={item} />
                <Text numberOfLines={1} style={styles.railTitle}>
                  {shortTitle(item.title, 23)}
                </Text>
                <Text numberOfLines={1} style={styles.railMeta}>
                  {item.by}
                </Text>
              </View>
            ))}
          </ScrollView>
        </Section>
      )}
      {games.length > 0 && (
        <Section title="Games for you">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            {games.slice(0, 6).map((item) => (
              <View key={item.id}>
                <Poster item={item} />
                <Text numberOfLines={1} style={styles.railTitle}>
                  {shortTitle(item.title, 23)}
                </Text>
                <Text numberOfLines={1} style={styles.railMeta}>
                  {item.by}
                </Text>
              </View>
            ))}
          </ScrollView>
        </Section>
      )}
      <Section title="Choose your next world">
        <View style={styles.worldGrid}>
          {(["FILM", "SHOW", "BOOK"] as const).map((kind) => (
            <Tap key={kind} onPress={() => { setFilter(kind); setTab("Discover"); }} style={[styles.worldCard, { borderColor: `${kindAccent[kind]}80` }]}>
              <View style={[styles.worldIcon, { backgroundColor: kindAccent[kind] }]}>
                <Ionicons name={kindIcon[kind]} size={20} color={C.ink} />
              </View>
              <Text style={styles.worldTitle}>{kindName[kind]}</Text>
              <Text style={styles.worldText}>{kind === "FILM" ? "A complete night in." : kind === "SHOW" ? "A world to return to." : "A story to live with."}</Text>
            </Tap>
          ))}
        </View>
      </Section>
      <Section title="Your taste, in motion">
        <Tap onPress={() => setCurating(true)} style={styles.tasteCta}>
          <View style={styles.tasteCtaIcon}>
            <Ionicons name="git-network-outline" size={21} color={C.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tasteCtaTitle}>Build a taste map, not just a watchlist.</Text>
            <Text style={styles.activityMeta}>MOOD · PACE · FAMILIARITY · COMMITMENT</Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color={C.teal} />
        </Tap>
      </Section>
    </ScrollView>
  );
  const Discover = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      <Header label="DISCOVER" />
      <Tap onPress={() => setCurating(true)} style={styles.curationCard}>
        <View>
          <Text style={styles.heroEyebrow}>TASTE CURATION</Text>
          <Text style={styles.curationTitle}>Teach Recco{`\n`}your taste.</Text>
          <Text style={styles.curationText}>
            Swipe through real films and series. Every signal shapes your next book match too.
          </Text>
        </View>
        <View style={styles.curationIcon}>
          <Ionicons name="sparkles" size={24} color={C.ink} />
        </View>
      </Tap>
      <Text style={styles.display}>Find a story{`\n`}for the mood.</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {(["ALL", "FILM", "SHOW", "BOOK", "GAME"] as const).map((item) => (
          <Tap
            key={item}
            onPress={() => setFilter(item)}
            style={[styles.chip, filter === item && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                filter === item && styles.chipTextActive,
              ]}
            >
              {item === "ALL"
                ? "Everything"
                : item[0] + item.slice(1).toLowerCase()}
            </Text>
          </Tap>
        ))}
      </ScrollView>
      <Section title="Curated for tonight">
        <View style={styles.discoverGrid}>
          {results.map((item) => (
            <Poster item={item} key={item.id} wide />
          ))}
        </View>
        {!results.length && (
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={28} color={C.teal} />
            <Text style={styles.emptyTitle}>Refreshing your picks</Text>
            <Text style={styles.emptyText}>
              Live film, series, book, and game recommendations will appear here in a moment.
            </Text>
          </View>
        )}
      </Section>
    </ScrollView>
  );
  const Search = () => (
    <KeyboardAvoidingView
      style={styles.searchPage}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.scroll}
    >
      <Header label="SEARCH" />
      <Text style={styles.display}>Find your{`\n`}{searchKind === "SHOW" ? "next series." : searchKind === "BOOK" ? "next book." : searchKind === "GAME" ? "next game." : "next film."}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.searchTypeRail}>
        {(["FILM", "SHOW", "BOOK", "GAME"] as const).map((kind) => {
          const active = searchKind === kind;
          return <Tap key={kind} onPress={() => setSearchKind(kind)} style={[styles.searchType, active && styles.searchTypeActive]}>
            <Ionicons name={kindIcon[kind]} size={15} color={active ? C.ink : kindAccent[kind]} />
            <Text style={[styles.searchTypeText, active && styles.searchTypeTextActive]}>{kind === "SHOW" ? "Series" : `${kindName[kind]}s`}</Text>
          </Tap>;
        })}
      </ScrollView>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={19} color={C.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${kindName[searchKind].toLowerCase()} titles...`}
          placeholderTextColor={C.muted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.searchInput}
        />
      </View>
      <Text style={styles.resultLabel}>
        {searching
          ? "SEARCHING RECCO..."
          : query
            ? `${remoteResults.length} RESULTS`
            : `EXPLORE ${searchKind === "SHOW" ? "SERIES" : `${kindName[searchKind].toUpperCase()}S`}`}
      </Text>
      <View style={styles.searchCardGrid}>
        {(query ? remoteResults : results.filter((item) => item.kind === searchKind)).map((item) => (
          <Tap
            key={item.id}
            onPress={() => open(item)}
            style={styles.searchCard}
          >
            <Image source={{ uri: item.image }} style={styles.searchCardImage} />
            <LinearGradient colors={["transparent", "rgba(4,8,7,.94)"]} style={styles.posterShade} />
            <View style={styles.searchCardInfo}>
              <Text style={[styles.mediaKind, { color: kindAccent[item.kind] }]}>{kindName[item.kind]}</Text>
              <Text numberOfLines={2} style={styles.searchTitle}>{shortTitle(item.title, 32)}</Text>
              <Text numberOfLines={1} style={styles.searchMeta}>{item.by} · {item.year}</Text>
            </View>
          </Tap>
        ))}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
  const Library = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      <Header label="LIBRARY" />
      <Text style={styles.display}>Your personal{`\n`}archive.</Text>
      <View style={styles.libraryStats}>
        <View>
          <Text style={styles.statNum}>{tracked.length}</Text>
          <Text style={styles.statLabel}>TRACKING</Text>
        </View>
        <View style={styles.statDivider} />
        <View>
          <Text style={styles.statNum}>{saved.length}</Text>
          <Text style={styles.statLabel}>SAVED</Text>
        </View>
        <Tap onPress={() => setTab("Discover")} style={styles.addCircle}>
          <Ionicons name="add" size={22} color={C.ink} />
        </Tap>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.libraryFilters}>
        {(["ALL", "TRACKING", "SAVED", "FINISHED"] as const).map((entry) => (
          <Tap
            key={entry}
            onPress={() => setLibraryFilter(entry)}
            style={[styles.libraryFilter, libraryFilter === entry && styles.libraryFilterActive]}
          >
            <Text style={[styles.libraryFilterText, libraryFilter === entry && styles.libraryFilterTextActive]}>
              {entry === "ALL" ? "Everything" : entry === "FINISHED" ? "Finished" : entry[0] + entry.slice(1).toLowerCase()}
            </Text>
          </Tap>
        ))}
      </ScrollView>
      <Text style={styles.smartShelfLabel}>SMART SHELVES</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.smartShelfRail}>
        <Tap onPress={() => setLibraryFilter("TRACKING")} style={styles.smartShelf}>
          <Ionicons name="play-circle-outline" size={20} color={C.teal} />
          <Text style={styles.smartShelfTitle}>Continue</Text>
          <Text style={styles.smartShelfMeta}>{trackingItems.length} in progress</Text>
        </Tap>
        <Tap onPress={() => setLibraryFilter("FINISHED")} style={styles.smartShelf}>
          <Ionicons name="checkmark-done-outline" size={20} color={kindAccent.BOOK} />
          <Text style={styles.smartShelfTitle}>Finished</Text>
          <Text style={styles.smartShelfMeta}>{completed.length} completed</Text>
        </Tap>
        <Tap onPress={() => setLibraryFilter("SAVED")} style={styles.smartShelf}>
          <Ionicons name="bookmark-outline" size={20} color={kindAccent.SHOW} />
          <Text style={styles.smartShelfTitle}>For later</Text>
          <Text style={styles.smartShelfMeta}>{saved.length} waiting</Text>
        </Tap>
      </ScrollView>
      <Section title="Your collections" action="PRIVATE BY DEFAULT">
        <View style={styles.collectionCreateRow}>
          <TextInput value={collectionDraft} onChangeText={setCollectionDraft} placeholder="Name a collection" placeholderTextColor={C.muted} maxLength={80} style={styles.collectionInput} />
          <Tap onPress={() => {
            const title = collectionDraft.trim();
            if (!title) { setCollectionMessage("Give your collection a name first."); return; }
            void createCollection(title).then((collection) => {
              setCollections((current) => [collection, ...current]);
              setCollectionDraft("");
              setCollectionMessage("Private collection created.");
            }).catch(() => setCollectionMessage("Could not create that collection. Try again."));
          }} style={styles.collectionCreateButton}><Ionicons name="add" size={20} color={C.ink} /></Tap>
        </View>
        {!!collectionMessage && <Text style={styles.collectionMessage}>{collectionMessage}</Text>}
        {collections.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collectionRail}>
          {collections.map((collection) => <Tap key={collection.id} onPress={() => {
            const message = collection.visibility === "UNLISTED" ? `A Recco collection for you: ${collection.title}\nrecco://collection/${collection.share_token}` : `My private Recco collection: ${collection.title}. ${collection.itemCount} title${collection.itemCount === 1 ? "" : "s"} saved so far.`;
            void Share.share({ message }).catch(() => undefined);
          }} style={styles.collectionCard}>
            <View style={styles.collectionCardIcon}><Ionicons name="layers-outline" size={19} color={C.ink} /></View>
            <Text numberOfLines={2} style={styles.collectionCardTitle}>{collection.title}</Text>
            <Text style={styles.collectionCardMeta}>{collection.itemCount} titles · {collection.visibility === "UNLISTED" ? "Link ready" : "Private"}</Text>
            <Tap onPress={() => void setCollectionVisibility(collection.id, collection.visibility === "PRIVATE" ? "UNLISTED" : "PRIVATE").then(() => setCollections((current) => current.map((entry) => entry.id === collection.id ? { ...entry, visibility: entry.visibility === "PRIVATE" ? "UNLISTED" : "PRIVATE" } : entry))).catch(() => undefined)} style={styles.collectionVisibility}>
              <Text style={styles.collectionVisibilityText}>{collection.visibility === "PRIVATE" ? "MAKE SHAREABLE" : "MAKE PRIVATE"}</Text>
            </Tap>
          </Tap>)}
        </ScrollView> : <Text style={styles.collectionEmpty}>Create a private shelf for a mood, a person, or a future night in.</Text>}
      </Section>
      <Section title="On your shelves">
        <View style={styles.libraryGrid}>
        {shelfItems.map((item) => (
            <Tap
              key={item.id}
              onPress={() => open(item)}
              style={styles.libraryCard}
            >
              <Image source={{ uri: item.image }} style={styles.libraryCardImage} />
              <LinearGradient
                colors={["transparent", "rgba(5,9,8,.96)"]}
                style={styles.posterShade}
              />
              <View style={styles.libraryCardTop}>
                <Text style={[styles.mediaKind, { color: kindAccent[item.kind] }]}>
                  {kindName[item.kind].toUpperCase()} · {completed.includes(item.id) ? "FINISHED" : tracked.includes(item.id) ? "IN PROGRESS" : "SAVED"}
                </Text>
              </View>
              <View style={styles.libraryCardInfo}>
                <Text numberOfLines={2} style={styles.libraryCardTitle}>{shortTitle(item.title, 32)}</Text>
                <Text numberOfLines={1} style={styles.libraryCardMeta}>
                  {kindName[item.kind]} · {item.year || item.by}
                </Text>
                {tracked.includes(item.id) && (
                  <View style={styles.libraryProgress}>
                    <View style={styles.libraryProgressFill} />
                  </View>
                )}
              </View>
            </Tap>
          ))}
        </View>
        {!shelfItems.length && (
          <Tap onPress={() => setTab("Discover")} style={styles.emptyShelf}>
            <Ionicons name="bookmark-outline" size={25} color={C.teal} />
            <Text style={styles.emptyTitle}>Your library is ready</Text>
            <Text style={styles.emptyText}>Save a film or start tracking a show to build your archive.</Text>
          </Tap>
        )}
      </Section>
    </ScrollView>
  );
  const Profile = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      <Header label="PROFILE" />
      <View style={styles.profile}>
        <View style={styles.profileAvatar}>
          <Image source={RECCO_MARK} style={styles.profileMark} />
        </View>
        <Text style={styles.profileName}>Your Recco</Text>
        <Text style={styles.profileHandle}>{account.isAnonymous ? "A private guest archive" : account.email ?? "A private media archive"}</Text>
      </View>
      <View style={styles.accountCard}>
        <Text style={styles.heroEyebrow}>ACCOUNT & BACKUP</Text>
        <Text style={styles.accountTitle}>{account.isAnonymous ? "Keep your archive across devices." : "Your archive is backed up."}</Text>
        <Text style={styles.accountText}>{account.isAnonymous ? "Add an email to claim this archive. Your saves, progress, reviews and taste profile stay exactly where they are." : "This account owns your private library and can be used to restore it on another device."}</Text>
        {account.isAnonymous ? <>
          <TextInput value={accountEmailInput} onChangeText={setAccountEmailInput} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="you@email.com" placeholderTextColor={C.muted} style={styles.accountInput} />
          <Tap onPress={() => {
            const email = accountEmailInput.trim();
            if (!/^\S+@\S+\.\S+$/.test(email)) { setAccountMessage("Enter a valid email address."); return; }
            setAccountMessage("Sending your secure confirmation link…");
            void requestAccountUpgrade(email).then(() => setAccountMessage("Check your email, then open the confirmation link on this phone.")).catch(() => setAccountMessage("Could not send the confirmation link. Check your email Auth settings and try again."));
          }} style={styles.accountButton}>
            <Text style={styles.primaryText}>Secure this archive</Text><Ionicons name="shield-checkmark-outline" size={17} color={C.ink} />
          </Tap>
        </> : null}
        {!!accountMessage && <Text style={styles.accountMessage}>{accountMessage}</Text>}
      </View>
      <View style={styles.tasteCard}>
        <Text style={styles.mediaKind}>YOUR TASTE PROFILE</Text>
        <Text style={styles.tasteTitle}>{Object.keys(tasteWeights).length ? "Built from the stories\nthat move you." : "Every story,\nin one place."}</Text>
        <View style={styles.tagRow}>
          {(Object.entries(tasteWeights)
            .filter(([tag, value]) => !tag.startsWith("kind:") && value > 0)
            .sort(([, left], [, right]) => right - left)
            .slice(0, 3)
            .map(([tag]) => tag) || []).concat(Object.keys(tasteWeights).length ? [] : ["Films", "Series", "Books"]).slice(0, 3).map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
        <Tap onPress={() => setOnboarding(true)} style={styles.retakeTaste}>
          <Text style={styles.retakeTasteText}>REFRESH YOUR TASTE SIGNALS</Text>
          <Ionicons name="arrow-forward" size={15} color={C.teal} />
        </Tap>
      </View>
      <Section title="This year">
        <View style={styles.yearRow}>
          <Stat value={String(tracked.length)} label="TRACKING" />
          <Stat value={String(saved.length)} label="SAVED" />
          <Stat value={String(Object.values(episodeProgress).filter(Boolean).length)} label="EPISODES" />
        </View>
      </Section>
      <Section title="Gentle reminders">
        <Tap onPress={() => {
          if (reminderEnabled) {
            void disableDailyReccoReminder().then(() => setReminderEnabled(false));
            return;
          }
          void enableDailyReccoReminder().then((enabled) => setReminderEnabled(enabled));
        }} style={[styles.reminderCard, reminderEnabled && styles.reminderCardActive]}>
          <View style={[styles.reminderIcon, reminderEnabled && styles.reminderIconActive]}><Ionicons name="notifications-outline" size={20} color={reminderEnabled ? C.ink : C.teal} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reminderTitle}>Your daily Recco</Text>
            <Text style={styles.reminderText}>{reminderEnabled ? "On · every day at 20:00" : "A gentle 20:00 reminder to return to your stories."}</Text>
          </View>
          <View style={[styles.reminderSwitch, reminderEnabled && styles.reminderSwitchActive]}><View style={[styles.reminderKnob, reminderEnabled && styles.reminderKnobActive]} /></View>
        </Tap>
      </Section>
      <View style={styles.creditsCard}>
        <Text style={styles.heroEyebrow}>DATA & CREDITS</Text>
        <Text style={styles.creditsText}>This product uses the TMDB API but is not endorsed or certified by TMDB. Game data and images: RAWG.</Text>
      </View>
    </ScrollView>
  );
  const page =
    tab === "Home" ? (
      Home()
    ) : tab === "Discover" ? (
      Discover()
    ) : tab === "Search" ? (
      Search()
    ) : tab === "Library" ? (
      Library()
    ) : (
      Profile()
    );
  return (
    <View style={styles.canvas}>
      <SafeAreaView style={styles.app} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        <Animated.View
          style={[
            styles.stage,
            {
              opacity: pageTransition,
              transform: [{ translateY: pageTransition.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
        >
          {page}
        </Animated.View>
        <Nav
          active={tab}
          bottomInset={insets.bottom}
          onChange={(next) => {
            buzz();
            setTab(next);
          }}
        />
        {selected && (
          <Detail
            item={selected}
            saved={saved.includes(selected.id)}
            tracked={tracked.includes(selected.id)}
            rating={rating[selected.id] ?? 0}
            episodeProgress={episodeProgress}
            trackingMeta={trackingMeta[selected.id] ?? {}}
            onClose={() => setSelected(null)}
            onSave={() => save(selected.id)}
            onTrack={() => track(selected.id)}
            onComplete={() => {
              setCompleted((items) => items.includes(selected.id) ? items.filter((id) => id !== selected.id) : [...items, selected.id]);
              setTracked((items) => items.filter((id) => id !== selected.id));
              setSaved((items) => items.includes(selected.id) ? items : [...items, selected.id]);
              setLibraryItems((items) => ({ ...items, [selected.id]: selected }));
              void syncMediaState(selected, completed.includes(selected.id) ? "SAVED" : "COMPLETED", { rating: rating[selected.id], progress: episodeProgress, tracking: trackingMeta[selected.id] }).catch(() => undefined);
            }}
            collectionName={collections[0]?.title}
            onAddToCollection={() => {
              const collection = collections[0];
              if (!collection) return;
              void addMediaToCollection(collection.id, selected).then(() => {
                setCollections((current) => current.map((entry) => entry.id === collection.id ? { ...entry, itemCount: entry.itemCount + 1 } : entry));
              }).catch(() => undefined);
            }}
            onRate={(value) => {
              setRating((values) => ({ ...values, [selected.id]: value }));
              void syncMediaState(selected, tracked.includes(selected.id) ? "IN_PROGRESS" : "SAVED", { rating: value, progress: episodeProgress }).catch(() => undefined);
            }}
            onEpisodeToggle={(id) =>
              setEpisodeProgress((values) => {
                const progress = { ...values, [id]: !values[id] };
                void syncMediaState(selected, "IN_PROGRESS", { rating: rating[selected.id], progress }).catch(() => undefined);
                return progress;
              })
            }
            onUpdateTracking={(patch) => {
              setTrackingMeta((current) => {
                const nextMeta = { ...(current[selected.id] ?? {}), ...patch };
                const next = { ...current, [selected.id]: nextMeta };
                void syncMediaState(selected, tracked.includes(selected.id) ? "IN_PROGRESS" : "SAVED", {
                  rating: rating[selected.id],
                  progress: episodeProgress,
                  tracking: nextMeta,
                }).catch(() => undefined);
                return next;
              });
              if (!saved.includes(selected.id)) setSaved((items) => [...items, selected.id]);
              setLibraryItems((items) => ({ ...items, [selected.id]: selected }));
            }}
          />
        )}
        {curating && (
          <SwipeDeck
            items={swipeItems}
            onClose={() => setCurating(false)}
            onOpen={open}
            onSignal={(item, action, vibes) => {
              buzz();
              if (action === "LOVE" || action === "SAVE") {
                setSaved((items) => items.includes(item.id) ? items : [...items, item.id]);
                setLibraryItems((items) => ({ ...items, [item.id]: item }));
                void syncMediaState(item, "SAVED", { rating: rating[item.id] }).catch(() => undefined);
              }
              const signal = action === "LOVE" ? 4 : action === "SAVE" ? 2 : action === "NOT_FOR_ME" ? -4 : -1;
              setTasteWeights((current) => {
                const next = { ...current, [`kind:${item.kind}`]: (current[`kind:${item.kind}`] ?? 0) + signal };
                item.genres?.forEach((genre) => { next[genre] = (next[genre] ?? 0) + signal; });
                vibes.forEach((vibe) => { next[`vibe:${vibe}`] = (next[`vibe:${vibe}`] ?? 0) + signal; });
                return next;
              });
              void syncSwipeAction(item, action, vibes).catch(() => undefined);
            }}
          />
        )}
        {onboarding && <Onboarding onDone={(features) => {
          setOnboarding(false);
          void AsyncStorage.setItem("recco-onboarded-v2", "true");
          setTasteWeights((current) => features.reduce((next, feature) => ({ ...next, [feature]: (next[feature] ?? 0) + 2 }), { ...current }));
          void seedTasteProfile(features).catch(() => undefined);
        }} />}
        {sharedCollection && <SharedCollection collection={sharedCollection} onClose={() => setSharedCollection(null)} onOpen={open} />}
      </SafeAreaView>
    </View>
  );
}

function Nav({
  active,
  bottomInset,
  onChange,
}: {
  active: Tab;
  bottomInset: number;
  onChange: (tab: Tab) => void;
}) {
  const items: {
    id: Tab;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
  }[] = [
    { id: "Home", icon: "home-outline", label: "Home" },
    { id: "Discover", icon: "compass-outline", label: "Discover" },
    { id: "Search", icon: "search-outline", label: "Search" },
    { id: "Library", icon: "bookmark-outline", label: "Library" },
    { id: "Profile", icon: "person-outline", label: "Profile" },
  ];
  return (
    <View
      style={[
        styles.nav,
        {
          height: Platform.OS === "web" ? 62 : 68,
          paddingBottom: Platform.OS === "web" ? 3 : 6,
        },
      ]}
    >
      {items.map((item) => (
        <Tap
          key={item.id}
          onPress={() => onChange(item.id)}
          style={styles.navItem}
        >
          <Ionicons
            name={
              active === item.id
                ? (item.icon.replace(
                    "-outline",
                    "",
                  ) as keyof typeof Ionicons.glyphMap)
                : item.icon
            }
            size={20}
            color={active === item.id ? C.gold : C.muted}
          />
          <Text
            style={[styles.navText, active === item.id && styles.navTextActive]}
          >
            {item.label}
          </Text>
          {active === item.id && <View style={styles.navDot} />}
        </Tap>
      ))}
    </View>
  );
}
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View>
      <Text style={styles.statNum}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function SwipeDeck({
  items,
  onClose,
  onOpen,
  onSignal,
}: {
  items: Media[];
  onClose: () => void;
  onOpen: (item: Media) => void;
  onSignal: (item: Media, action: TasteAction, vibes: string[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [queue, setQueue] = useState<Media[]>(items);
  const [loadingMore, setLoadingMore] = useState(true);
  const [deckError, setDeckError] = useState(false);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const card = useRef(new Animated.ValueXY()).current;
  const seenIds = useRef(new Set<string>());
  const nextPage = useRef(2);
  const loadingPage = useRef(false);
  const swipeInFlight = useRef(false);
  const { height: viewportHeight } = useWindowDimensions();
  const item = queue[index];
  const next = queue[index + 1];
  const third = queue[index + 2];
  const deckHeight = Platform.OS === "web" ? 520 : Math.min(690, Math.max(470, viewportHeight * 0.68));
  useEffect(() => {
    seenIds.current = new Set();
    nextPage.current = items.length ? 2 : 1;
    setQueue(items);
    setIndex(0);
    setLoadingMore(true);
    setDeckError(false);
    loadSwipeHistory()
      .then((history) => {
        seenIds.current = new Set(history);
        setQueue((current) => current.filter((entry) => !seenIds.current.has(entry.id)));
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [items]);
  useEffect(() => {
    if (queue.length - index > 5 || loadingPage.current || deckError) return;
    loadingPage.current = true;
    setLoadingMore(true);
    const page = nextPage.current++;
    getTrendingMedia(page)
      .then((incoming) => {
        setQueue((current) => {
          const queued = new Set(current.map((entry) => entry.id));
          const fresh = incoming.filter((entry) => !queued.has(entry.id) && !seenIds.current.has(entry.id));
          return [...current, ...fresh];
        });
      })
      .catch(() => setDeckError(true))
      .finally(() => {
        loadingPage.current = false;
        setLoadingMore(false);
        setLoadAttempt((attempt) => attempt + 1);
      });
  }, [deckError, index, loadAttempt, queue.length]);
  useEffect(() => {
    [next, third].forEach((entry) => {
      if (entry?.image) void Image.prefetch(entry.image).catch(() => undefined);
    });
  }, [next?.image, third?.image]);
  const advance = (action: TasteAction) => {
    if (!item || swipeInFlight.current) return;
    swipeInFlight.current = true;
    Animated.timing(card, {
      toValue: { x: action === "LOVE" || action === "SAVE" ? 500 : -500, y: 25 },
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      onSignal(item, action, selectedVibes);
      seenIds.current.add(item.id);
      // The old card is already off screen. Resetting it before state changes
      // prevents a one-frame flash of the next title in the centre.
      card.setValue({ x: 0, y: 0 });
      setIndex((value) => value + 1);
      setSelectedVibes([]);
      swipeInFlight.current = false;
    });
  };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 7,
        onPanResponderMove: Animated.event([null, { dx: card.x, dy: card.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_, gesture) =>
          gesture.dx > 85
            ? advance("SAVE")
            : gesture.dx < -85
              ? advance("PASS")
              : Animated.spring(card, {
                  toValue: { x: 0, y: 0 },
                  useNativeDriver: true,
                  speed: 18,
                  bounciness: 7,
                }).start(),
      }),
    [item?.id, selectedVibes],
  );
  const tilt = card.x.interpolate({
    inputRange: [-250, 0, 250],
    outputRange: ["-10deg", "0deg", "10deg"],
  });
  const saveOpacity = card.x.interpolate({
    inputRange: [0, 55, 120],
    outputRange: [0, 0.55, 1],
    extrapolate: "clamp",
  });
  const passOpacity = card.x.interpolate({
    inputRange: [-120, -55, 0],
    outputRange: [1, 0.55, 0],
    extrapolate: "clamp",
  });
  if (!item) {
    return (
      <View style={styles.swipePage}>
        <View style={styles.swipeHeader}>
          <Tap onPress={onClose} style={styles.swipeClose}>
            <Ionicons name="close" size={20} color={C.ivory} />
          </Tap>
          <Text style={styles.heroEyebrow}>TASTE CURATION</Text>
        </View>
        <View style={styles.swipeDone}>
          <View style={styles.swipeDoneIcon}>
            <Ionicons name="sparkles" size={31} color={C.ink} />
          </View>
          <Text style={styles.swipeDoneTitle}>
            {deckError ? "Could not load titles." : "Loading your deck."}
          </Text>
          <Text style={styles.swipeDoneText}>
            {deckError
              ? "Check your connection, then try again."
              : "Loading a live mix of films, series and books for you."}
          </Text>
          {deckError && (
            <Tap
              onPress={() => {
                nextPage.current = 1;
                setDeckError(false);
                setLoadingMore(true);
                setLoadAttempt((attempt) => attempt + 1);
              }}
              style={styles.doneButton}
            >
              <Text style={styles.doneButtonText}>TRY AGAIN</Text>
            </Tap>
          )}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.swipePage}>
      <View style={styles.swipeHeader}>
        <Tap onPress={onClose} style={styles.swipeClose}>
          <Ionicons name="close" size={20} color={C.ivory} />
        </Tap>
        <View>
          <Text style={styles.heroEyebrow}>TASTE CURATION</Text>
          <Text style={styles.swipeCount}>
            {String(index + 1).padStart(2, "0")} / {String(queue.length).padStart(2, "0")}
          </Text>
        </View>
      </View>
      <View style={styles.swipeIntro}>
        <Text style={styles.swipeIntroTitle}>Your next obsession.</Text>
        <Text style={styles.swipeIntroHint}>{loadingMore ? "Updating your deck" : "Swipe to shape it"}</Text>
      </View>
      <View style={[styles.deck, { height: deckHeight }]}>
        {third && <View style={[styles.nextDeckCard, styles.thirdDeckCard]} />}
        <View style={[styles.nextDeckCard, styles.peekDeckCard]}>
          {next && (
            <>
              <Image source={{ uri: next.image }} style={styles.deckImage} />
              <LinearGradient
                colors={["transparent", "rgba(4,8,7,.96)"]}
                style={styles.posterShade}
              />
              <View style={styles.nextDeckInfo}>
                <Text style={[styles.mediaKind, { color: kindAccent[next.kind] }]}>{kindName[next.kind]}</Text>
                <Text numberOfLines={2} style={styles.nextDeckTitle}>{shortTitle(next.title, 38)}</Text>
                <Text numberOfLines={1} style={styles.nextDeckMeta}>
                  {next.score ? `★ ${next.score.toFixed(1)} · ` : ""}{kindName[next.kind]} · {next.year}
                </Text>
              </View>
            </>
          )}
        </View>
        <Animated.View
          {...pan.panHandlers}
          style={[
            styles.deckCard,
            {
              transform: [
                { translateX: card.x },
                { translateY: card.y },
                { rotate: tilt },
              ],
            },
          ]}
        >
          <Image source={{ uri: item.image }} style={styles.deckImage} />
          <LinearGradient
            colors={["transparent", "rgba(4,8,7,.96)"]}
            style={styles.posterShade}
          />
          <Animated.View
            style={[
              styles.swipeStamp,
              styles.saveStamp,
              { opacity: saveOpacity },
            ]}
          >
            <Text style={styles.saveStampText}>QUEUE</Text>
          </Animated.View>
          <Animated.View
            style={[
              styles.swipeStamp,
              styles.passStamp,
              { opacity: passOpacity },
            ]}
          >
            <Text style={styles.passStampText}>PASS</Text>
          </Animated.View>
          <Tap onPress={() => onOpen(item)} style={styles.deckPreviewButton}>
            <Ionicons name="information" size={18} color={C.ivory} />
            <Text style={styles.deckPreviewText}>WHY</Text>
          </Tap>
          <View style={styles.deckInfo}>
            <Text style={[styles.mediaKind, { color: kindAccent[item.kind] }]}>{kindName[item.kind]}</Text>
            <Text numberOfLines={2} style={styles.deckTitle}>{shortTitle(item.title, 42)}</Text>
            <View style={styles.deckFacts}>
              {item.score ? <Text style={styles.deckScore}>★ {item.score.toFixed(1)}</Text> : null}
              <Text style={styles.deckMeta}>{kindName[item.kind]}</Text>
            </View>
            <Text style={styles.deckMeta}>
              {item.by} · {item.year}
            </Text>
            {!!item.genres?.length && (
              <Text numberOfLines={1} style={styles.deckGenres}>Because you lean toward {item.genres.slice(0, 3).join(" · ")}</Text>
            )}
            <Text style={styles.deckNote}>{item.note}</Text>
          </View>
        </Animated.View>
      </View>
      <View style={styles.vibePanel}>
        <View style={styles.vibePanelTop}>
          <Text style={styles.vibePrompt}>WHAT FEELING ARE YOU AFTER?</Text>
          <Text style={styles.vibeCount}>{selectedVibes.length ? `${selectedVibes.length} selected` : "Optional"}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vibeRail}>
          {tasteVibes.map((vibe) => {
            const active = selectedVibes.includes(vibe);
            return (
              <Tap
                key={vibe}
                onPress={() => setSelectedVibes((current) => active ? current.filter((entry) => entry !== vibe) : current.length >= 2 ? [...current.slice(1), vibe] : [...current, vibe])}
                style={[styles.vibeChip, active && styles.vibeChipActive]}
              >
                <Text style={[styles.vibeChipText, active && styles.vibeChipTextActive]}>{vibe}</Text>
              </Tap>
            );
          })}
        </ScrollView>
      </View>
      <View style={styles.swipeActions}>
        <View style={styles.signalAction}>
          <Tap onPress={() => advance("NOT_FOR_ME")} style={styles.notForMeAction}>
            <Ionicons name="close" size={23} color="#E9917A" />
          </Tap>
          <Text style={styles.signalLabel}>Not me</Text>
        </View>
        <View style={styles.signalAction}>
          <Tap onPress={() => advance("PASS")} style={styles.passAction}>
            <Ionicons name="arrow-back" size={20} color={C.ivory} />
          </Tap>
          <Text style={styles.signalLabel}>Not now</Text>
        </View>
        <View style={styles.signalAction}>
          <Tap onPress={() => advance("SAVE")} style={styles.keepAction}>
            <Ionicons name="bookmark" size={20} color={C.ink} />
          </Tap>
          <Text style={styles.signalLabel}>Queue it</Text>
        </View>
        <View style={styles.signalAction}>
          <Tap onPress={() => advance("LOVE")} style={styles.loveAction}>
            <Ionicons name="heart" size={21} color={C.ink} />
          </Tap>
          <Text style={styles.signalLabel}>This is it</Text>
        </View>
      </View>
    </View>
  );
}
function Detail({
  item,
  saved,
  tracked,
  rating,
  episodeProgress,
  trackingMeta,
  onClose,
  onSave,
  onTrack,
  onComplete,
  collectionName,
  onAddToCollection,
  onRate,
  onEpisodeToggle,
  onUpdateTracking,
}: {
  item: Media;
  saved: boolean;
  tracked: boolean;
  rating: number;
  episodeProgress: Record<string, boolean>;
  trackingMeta: TrackingMeta;
  onClose: () => void;
  onSave: () => void;
  onTrack: () => void;
  onComplete: () => void;
  collectionName?: string;
  onAddToCollection: () => void;
  onRate: (value: number) => void;
  onEpisodeToggle: (id: string) => void;
  onUpdateTracking: (patch: TrackingMeta) => void;
}) {
  const insets = useSafeAreaInsets();
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getTitleDetails>>>(null);
  const [season, setSeason] = useState<number | undefined>();
  const [loadingDetails, setLoadingDetails] = useState(item.id.startsWith("tmdb-tv-"));
  const [reviews, setReviews] = useState<Record<number, { body: string; rating: number | null }>>({});
  const [reviewing, setReviewing] = useState<{ number: number; title: string } | null>(null);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [titleReviewBody, setTitleReviewBody] = useState("");
  const [titleReviewSaved, setTitleReviewSaved] = useState(false);
  useEffect(() => {
    let active = true;
    setLoadingDetails(item.id.startsWith("tmdb-"));
    getTitleDetails(item, season)
      .then((value) => active && setDetails(value))
      .catch(() => active && setDetails(null))
      .finally(() => active && setLoadingDetails(false));
    return () => {
      active = false;
    };
  }, [item.id, season]);
  const episodes = details?.episodes ?? [];
  const selectedSeason = season ?? details?.selectedSeason ?? 1;
  useEffect(() => {
    if (item.kind !== "SHOW") return;
    let active = true;
    loadEpisodeReviews(item.id, selectedSeason)
      .then((entries) => {
        if (active) setReviews(Object.fromEntries(entries.map((entry) => [entry.episode_number, { body: entry.body, rating: entry.rating }])));
      })
      .catch(() => active && setReviews({}));
    return () => {
      active = false;
    };
  }, [item.id, item.kind, selectedSeason]);
  useEffect(() => {
    let active = true;
    setTitleReviewSaved(false);
    loadMediaReview(item.id)
      .then((review) => {
        if (active) setTitleReviewBody(review?.body ?? "");
      })
      .catch(() => active && setTitleReviewBody(""));
    return () => {
      active = false;
    };
  }, [item.id]);
  const watchedEpisodes = episodes.filter((episode) => episodeProgress[episode.id]).length;
  const description = details?.overview || item.note || "Save it now and pick it up when the moment is right.";
  return (
    <View style={styles.overlay}>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.grab} />
        <Tap onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={20} color={C.ivory} />
        </Tap>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.detailScroll}
        >
          <View style={styles.detailTop}>
            <Image source={{ uri: item.image }} style={styles.detailPoster} />
            <View style={{ flex: 1 }}>
              <Text style={styles.mediaKind}>{item.kind}</Text>
              <Text numberOfLines={2} style={styles.detailTitle}>{shortTitle(item.title, 48)}</Text>
              <Text style={styles.detailMeta}>
                {item.by} · {item.year}
              </Text>
              <Text style={styles.detailBody}>{description}</Text>
            </View>
          </View>
          {details?.genres?.length ? (
            <View style={styles.genreRow}>
              {details.genres.map((genre) => (
                <View key={genre} style={styles.genrePill}>
                  <Text style={styles.genreText}>{genre}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {item.kind === "BOOK" && (
            <View style={styles.trackerCard}>
              <View style={styles.trackerTop}>
                <View>
                  <Text style={[styles.mediaKind, { color: kindAccent.BOOK }]}>READING PROGRESS</Text>
                  <Text style={styles.trackerTitle}>{trackingMeta.bookProgress ?? 0}% through this book</Text>
                </View>
                <Ionicons name="book-outline" size={21} color={kindAccent.BOOK} />
              </View>
              <View style={styles.bookProgressBar}><View style={[styles.bookProgressFill, { width: `${trackingMeta.bookProgress ?? 0}%` }]} /></View>
              <View style={styles.trackerActions}>
                <Tap onPress={() => onUpdateTracking({ bookProgress: Math.max(0, (trackingMeta.bookProgress ?? 0) - 10) })} style={styles.trackerStep}><Text style={styles.trackerStepText}>− 10%</Text></Tap>
                <Tap onPress={() => onUpdateTracking({ bookProgress: Math.min(100, (trackingMeta.bookProgress ?? 0) + 10) })} style={styles.trackerStep}><Text style={styles.trackerStepText}>+ 10%</Text></Tap>
              </View>
            </View>
          )}
          {item.kind === "FILM" && (
            <View style={styles.trackerCard}>
              <View style={styles.trackerTop}>
                <View>
                  <Text style={[styles.mediaKind, { color: kindAccent.FILM }]}>FILM DIARY</Text>
                  <Text style={styles.trackerTitle}>{trackingMeta.watchedOn ? `Watched ${trackingMeta.watchedOn}` : "Log it when you watch"}</Text>
                </View>
                <Ionicons name="film-outline" size={21} color={kindAccent.FILM} />
              </View>
              <View style={styles.trackerActions}>
                <Tap onPress={() => onUpdateTracking({ watchedOn: trackingMeta.watchedOn ? undefined : new Date().toISOString().slice(0, 10) })} style={[styles.trackerStep, trackingMeta.watchedOn && styles.trackerStepActive]}><Text style={[styles.trackerStepText, trackingMeta.watchedOn && styles.trackerStepTextActive]}>{trackingMeta.watchedOn ? "Watched" : "Watch today"}</Text></Tap>
                <Tap onPress={() => onUpdateTracking({ rewatch: !trackingMeta.rewatch })} style={[styles.trackerStep, trackingMeta.rewatch && styles.trackerStepActive]}><Text style={[styles.trackerStepText, trackingMeta.rewatch && styles.trackerStepTextActive]}>Rewatch</Text></Tap>
              </View>
            </View>
          )}
          {item.kind === "SHOW" && details?.seasons?.length ? (
            <View style={styles.seasonBlock}>
              <View style={styles.episodeHeading}>
                <Text style={styles.detailLabel}>EPISODE PROGRESS</Text>
                <Text style={styles.episodeCount}>
                  {watchedEpisodes}/{episodes.length} WATCHED
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonChips}>
                {details.seasons.map((entry) => (
                  <Tap
                    key={entry.number}
                    onPress={() => setSeason(entry.number)}
                    style={[styles.seasonChip, (season ?? details.selectedSeason) === entry.number && styles.seasonChipActive]}
                  >
                    <Text style={[styles.seasonChipText, (season ?? details.selectedSeason) === entry.number && styles.seasonChipTextActive]}>
                      S{entry.number}
                    </Text>
                  </Tap>
                ))}
              </ScrollView>
            </View>
          ) : null}
          {episodes.length > 0 && (
            <>
              {!details?.seasons?.length && <Text style={styles.detailLabel}>EPISODES</Text>}
              {episodes.map((episode) => (
                <View key={episode.id} style={styles.episodeRow}>
                  <Tap onPress={() => onEpisodeToggle(episode.id)} style={styles.episode}>
                    <Text style={styles.episodeNum}>{episode.number}</Text>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} style={styles.episodeTitle}>{shortTitle(episode.title, 42)}</Text>
                      <Text style={styles.episodeMeta}>
                        {typeof episode.runtime === "number" ? `${episode.runtime} min` : episode.runtime}
                      </Text>
                    </View>
                    <Ionicons
                      name={episodeProgress[episode.id] ? "checkmark-circle" : "ellipse-outline"}
                      size={20}
                      color={episodeProgress[episode.id] ? C.teal : C.muted}
                    />
                  </Tap>
                  <Tap
                    onPress={() => {
                      const current = reviews[episode.number];
                      setReviewing({ number: episode.number, title: episode.title });
                      setReviewBody(current?.body ?? "");
                      setReviewRating(current?.rating ?? 0);
                    }}
                    style={styles.episodeNote}
                  >
                    <Ionicons name={reviews[episode.number]?.body ? "chatbubble" : "chatbubble-outline"} size={17} color={reviews[episode.number]?.body ? C.teal : C.muted} />
                  </Tap>
                </View>
              ))}
            </>
          )}
          {reviewing && (
            <View style={styles.reviewEditor}>
              <View style={styles.reviewHeading}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mediaKind}>EPISODE {reviewing.number} NOTE</Text>
                  <Text style={styles.reviewTitle}>{reviewing.title}</Text>
                </View>
                <Tap onPress={() => setReviewing(null)} style={styles.reviewClose}>
                  <Ionicons name="close" size={16} color={C.ivory} />
                </Tap>
              </View>
              <TextInput
                value={reviewBody}
                onChangeText={setReviewBody}
                placeholder="What did you think?"
                placeholderTextColor={C.muted}
                multiline
                maxLength={2000}
                style={styles.reviewInput}
              />
              <View style={styles.reviewFooter}>
                <View style={styles.reviewStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Tap key={star} onPress={() => setReviewRating(star)}>
                      <Ionicons name={star <= reviewRating ? "star" : "star-outline"} size={18} color={C.teal} />
                    </Tap>
                  ))}
                </View>
                <Tap
                  onPress={() => {
                    const review = { media_id: item.id, season_number: selectedSeason, episode_number: reviewing.number, body: reviewBody.trim(), rating: reviewRating || null };
                    setReviews((current) => ({ ...current, [reviewing.number]: { body: review.body, rating: review.rating } }));
                    void saveEpisodeReview(review).catch(() => undefined);
                    setReviewing(null);
                  }}
                  style={styles.reviewSave}
                >
                  <Text style={styles.primaryText}>Save note</Text>
                </Tap>
              </View>
            </View>
          )}
          {loadingDetails && item.kind === "SHOW" && (
            <Text style={styles.loadingText}>LOADING EPISODES…</Text>
          )}
          <View style={styles.titleReviewCard}>
            <View style={styles.titleReviewTop}>
              <View>
                <Text style={[styles.mediaKind, { color: kindAccent[item.kind] }]}>YOUR TAKE ON THIS {kindName[item.kind].toUpperCase()}</Text>
                <Text style={styles.titleReviewTitle}>Leave a private note</Text>
              </View>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={kindAccent[item.kind]} />
            </View>
            <TextInput
              value={titleReviewBody}
              onChangeText={(value) => {
                setTitleReviewBody(value);
                setTitleReviewSaved(false);
              }}
              placeholder={`What did ${shortTitle(item.title, 26)} make you feel?`}
              placeholderTextColor={C.muted}
              multiline
              maxLength={4000}
              style={styles.titleReviewInput}
            />
            <View style={styles.titleReviewFooter}>
              <Text style={styles.noteHelper}>{titleReviewSaved ? "Saved to your private archive" : "Only you can see this"}</Text>
              <Tap
                onPress={() => {
                  void saveMediaReview({ media_id: item.id, body: titleReviewBody.trim(), rating: rating || null })
                    .then(() => setTitleReviewSaved(true))
                    .catch(() => undefined);
                }}
                style={styles.titleReviewSave}
              >
                <Text style={styles.primaryText}>Save note</Text>
              </Tap>
            </View>
          </View>
          <Text style={styles.detailLabel}>YOUR RATING</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Tap key={star} onPress={() => onRate(star)}>
                <Ionicons
                  name={star <= rating ? "star" : "star-outline"}
                  size={25}
                  color={C.gold}
                />
              </Tap>
            ))}
          </View>
        </ScrollView>
        <View style={styles.detailActions}>
          <Tap onPress={onSave} style={styles.secondaryBtn}>
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={18}
              color={C.ivory}
            />
            <Text style={styles.secondaryText}>
              {saved ? "Saved" : "Save"}
            </Text>
          </Tap>
          <Tap onPress={onTrack} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>
              {tracked ? "Tracking" : "Track this"}
            </Text>
            <Ionicons
              name={tracked ? "checkmark" : "add"}
              size={17}
              color={C.ink}
            />
          </Tap>
        </View>
        <Tap onPress={onComplete} style={styles.completeBtn}>
          <Ionicons name="checkmark-circle-outline" size={17} color={C.teal} />
          <Text style={styles.completeText}>Mark as finished</Text>
        </Tap>
        {collectionName && <Tap onPress={onAddToCollection} style={styles.addCollectionBtn}>
          <Ionicons name="add-circle-outline" size={16} color={kindAccent[item.kind]} />
          <Text style={[styles.addCollectionText, { color: kindAccent[item.kind] }]}>Add to {shortTitle(collectionName, 22)}</Text>
        </Tap>}
        <Tap onPress={() => void Share.share({ message: `A Recco for you: ${item.title} (${item.year}). ${item.note || "Added from my personal media archive."}` }).catch(() => undefined)} style={styles.shareReccoBtn}>
          <Ionicons name="share-outline" size={16} color={C.muted} />
          <Text style={styles.shareReccoText}>Share this Recco</Text>
        </Tap>
      </View>
    </View>
  );
}
function SharedCollection({ collection, onClose, onOpen }: { collection: { title: string; description: string; items: Media[] }; onClose: () => void; onOpen: (item: Media) => void }) {
  return <View style={styles.overlay}>
    <View style={[styles.sheet, styles.sharedSheet]}>
      <Tap onPress={onClose} style={styles.close}><Ionicons name="close" size={20} color={C.ivory} /></Tap>
      <Text style={styles.heroEyebrow}>A SHARED RECCO COLLECTION</Text>
      <Text style={styles.sharedTitle}>{collection.title}</Text>
      {!!collection.description && <Text style={styles.sharedDescription}>{collection.description}</Text>}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sharedList}>
        {collection.items.map((item) => <Tap key={item.id} onPress={() => onOpen(item)} style={styles.sharedItem}>
          <Image source={{ uri: item.image }} style={styles.sharedPoster} />
          <View style={{ flex: 1 }}><Text style={[styles.mediaKind, { color: kindAccent[item.kind] }]}>{kindName[item.kind]}</Text><Text numberOfLines={2} style={styles.sharedItemTitle}>{shortTitle(item.title, 34)}</Text><Text style={styles.sharedItemMeta}>{item.by} · {item.year}</Text></View>
          <Ionicons name="arrow-forward" size={16} color={C.teal} />
        </Tap>)}
      </ScrollView>
    </View>
  </View>;
}
function Onboarding({ onDone }: { onDone: (features: string[]) => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const steps = [
    { eyebrow: "STEP 1 OF 3 · YOUR WORLDS", title: "What do you reach for?", body: "Pick the feelings or genres you never get tired of.", options: ["Drama", "Mystery", "Fantasy", "Comedy", "Romance", "Science Fiction"] },
    { eyebrow: "STEP 2 OF 3 · YOUR ENERGY", title: "How should a story feel?", body: "These signals make the first Reccos feel personal.", options: ["Comfort", "Intense", "Escapist", "Cerebral", "Tender", "Unexpected"] },
    { eyebrow: "STEP 3 OF 3 · YOUR FORMATS", title: "Where should we start?", body: "You can add more worlds whenever you want.", options: ["kind:FILM", "kind:SHOW", "kind:BOOK"] },
  ];
  const current = steps[step];
  const label = (value: string) => value.startsWith("kind:") ? `${kindName[value.slice(5) as Kind]}s` : value;
  const toggle = (value: string) => setAnswers((currentAnswers) => currentAnswers.includes(value) ? currentAnswers.filter((entry) => entry !== value) : [...currentAnswers, value]);
  return (
    <View style={styles.onboard}>
      <View style={styles.onboardHeader}><Brand /><Text style={styles.onboardStep}>{step + 1}/3</Text></View>
      <View style={styles.onboardArt}>
        <LinearGradient colors={["#1F5C53", "#16302C", "#0E1513"]} style={StyleSheet.absoluteFill} />
        <View style={styles.onboardOrbOne} /><View style={styles.onboardOrbTwo} />
        <View style={styles.onboardMark}><Image source={RECCO_MARK} style={styles.onboardMarkImage} /></View>
        <Text style={styles.onboardArtText}>{step === 0 ? "Your taste,{`\n`}in motion." : step === 1 ? "Follow the{`\n`}feeling." : "Every format,{`\n`}one profile."}</Text>
      </View>
      <View style={styles.onboardCopy}>
        <Text style={styles.heroEyebrow}>{current.eyebrow}</Text>
        <Text style={styles.onboardTitle}>{current.title}</Text>
        <Text style={styles.onboardBody}>{current.body}</Text>
        <View style={styles.onboardChoices}>
          {current.options.map((option) => {
            const active = answers.includes(option);
            return <Tap key={option} onPress={() => toggle(option)} style={[styles.onboardChoice, active && styles.onboardChoiceActive]}><Text style={[styles.onboardChoiceText, active && styles.onboardChoiceTextActive]}>{label(option)}</Text>{active && <Ionicons name="checkmark" size={15} color={C.ink} />}</Tap>;
          })}
        </View>
      </View>
      <Tap onPress={() => step < steps.length - 1 ? setStep((value) => value + 1) : onDone(answers)} style={styles.onboardButton}>
        <Text style={styles.primaryText}>{step < steps.length - 1 ? "Continue" : "Build my Reccos"}</Text>
        <Ionicons name="arrow-forward" size={18} color={C.ink} />
      </Tap>
      <Text style={styles.onboardFine}>Private by default. You can change these signals anytime.</Text>
    </View>
  );
}

const C = {
  ink: "#0E1513",
  surface: "#161D1B",
  surface2: "#202927",
  ivory: "#E8E6DE",
  muted: "#8E9C96",
  gold: "#44DDC1",
  teal: "#44DDC1",
  line: "#30403A",
};
const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.ink,
  },
  app: {
    flex: 1,
    width: "100%",
    backgroundColor: C.ink,
    overflow: "hidden",
  },
  island: {
    position: "absolute",
    zIndex: 30,
    top: 8,
    alignSelf: "center",
    width: 112,
    height: 30,
    borderRadius: 20,
    backgroundColor: "#000",
  },
  homeBar: {
    position: "absolute",
    zIndex: 30,
    bottom: 6,
    alignSelf: "center",
    width: 126,
    height: 5,
    borderRadius: 4,
    backgroundColor: C.ivory,
  },
  stage: { flex: 1 },
  scroll: {
    paddingTop: Platform.OS === "web" ? 32 : 18,
    paddingHorizontal: Platform.OS === "web" ? 17 : 20,
    paddingBottom: 28,
  },
  header: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Platform.OS === "web" ? 17 : 25,
  },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 7 },
  brandMark: { width: 28, height: 28, borderRadius: 8 },
  brandMarkCompact: { width: 22, height: 22, borderRadius: 6 },
  brand: {
    color: C.teal,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -1.4,
  },
  brandInverse: { color: C.ivory },
  headerLabel: {
    color: C.muted,
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: "800",
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.ivory,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    height: Platform.OS === "web" ? 290 : 365,
    borderRadius: 25,
    overflow: "hidden",
    backgroundColor: C.surface,
    marginBottom: Platform.OS === "web" ? 28 : 38,
  },
  heroImage: { width: "100%", height: "100%" },
  heroShade: { ...StyleSheet.absoluteFill },
  heroMark: { position: "absolute", width: 96, height: 96, right: 13, top: 55, opacity: 0.82 },
  heroTop: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroEyebrow: {
    color: C.teal,
    fontSize: 9,
    letterSpacing: 1.35,
    fontWeight: "900",
  },
  match: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    backgroundColor: C.gold,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
  },
  matchText: { color: C.ink, fontSize: 8, fontWeight: "900" },
  heroBottom: { position: "absolute", bottom: 18, left: 18, right: 18 },
  heroTitle: {
    color: "#FFF",
    fontSize: 35,
    lineHeight: 35,
    letterSpacing: -1.7,
    fontWeight: "900",
  },
  heroBody: {
    color: "#D8DED9",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    maxWidth: 270,
  },
  heroButton: {
    marginTop: 14,
    alignSelf: "flex-start",
    backgroundColor: C.teal,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 15,
    height: 38,
    borderRadius: 19,
  },
  heroButtonText: { color: C.ink, fontSize: 11, fontWeight: "900" },
  homeCatalogState: {
    minHeight: 245,
    borderRadius: 24,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    marginBottom: 28,
  },
  tastePulse: { minHeight: 127, padding: 17, borderRadius: 22, marginBottom: 36, overflow: "hidden", backgroundColor: "#12322D", borderWidth: 1, borderColor: "#236256", flexDirection: "row", alignItems: "center" },
  tastePulseCopy: { flex: 1, paddingRight: 14 },
  tastePulseTitle: { color: C.ivory, fontSize: 19, lineHeight: 22, letterSpacing: -0.5, fontWeight: "900", marginTop: 7 },
  tastePulseText: { color: "#B7D3CB", fontSize: 10, lineHeight: 14, marginTop: 7 },
  tasteOrbit: { width: 70, height: 70, borderRadius: 35, backgroundColor: C.teal, alignItems: "center", justifyContent: "center" },
  tasteOrbitInner: { position: "absolute", width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: "rgba(14,21,19,.35)" },
  tasteOrbitDot: { position: "absolute", width: 9, height: 9, right: 11, top: 12, borderRadius: 5, backgroundColor: C.ink },
  section: { marginBottom: 37 },
  sectionTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 15,
  },
  sectionTitle: {
    color: C.ivory,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  sectionAction: {
    color: C.teal,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "900",
  },
  rail: { gap: 13, paddingRight: 20 },
  posterCard: { width: 126 },
  poster: {
    width: 126,
    height: 174,
    borderRadius: 17,
    backgroundColor: C.surface2,
  },
  posterTypeRail: { position: "absolute", top: 0, left: 11, right: 11, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  posterShade: { ...StyleSheet.absoluteFill },
  posterInfo: { position: "absolute", left: 10, right: 9, bottom: 9 },
  mediaKind: {
    color: C.teal,
    fontSize: 8,
    letterSpacing: 1.1,
    fontWeight: "900",
  },
  kindBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  posterTitle: { color: "#FFF", fontSize: 13, fontWeight: "800", marginTop: 3 },
  railTitle: { color: C.ivory, fontSize: 14, fontWeight: "700", marginTop: 8 },
  railMeta: { color: C.muted, fontSize: 10, marginTop: 2 },
  progress: {
    marginTop: 8,
    height: 3,
    backgroundColor: C.line,
    borderRadius: 2,
  },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: C.teal },
  wall: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  worldGrid: { flexDirection: "row", gap: 9 },
  worldCard: { flex: 1, minHeight: 146, padding: 11, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1 },
  worldIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  worldTitle: { color: C.ivory, fontSize: 14, fontWeight: "900", marginTop: 13 },
  worldText: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 4 },
  homeCta: {
    marginTop: 6,
    marginBottom: 24,
    minHeight: 100,
    borderRadius: 19,
    padding: 17,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  homeCtaTitle: { color: C.ivory, fontSize: 16, fontWeight: "800", marginTop: 7 },
  homeCtaText: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  crossMediaCard: {
    minHeight: 174,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  crossMediaPoster: { width: 48, height: 72, borderRadius: 10, backgroundColor: C.surface2 },
  crossMediaRule: { width: 1, height: 42, marginTop: 15, backgroundColor: C.line },
  crossMediaCopy: { position: "absolute", left: 13, right: 48, bottom: 14 },
  crossMediaTitle: { color: C.ivory, fontSize: 16, lineHeight: 19, letterSpacing: -0.4, fontWeight: "900", marginTop: 6 },
  crossMediaMeta: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 6 },
  activity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderRadius: 18,
    backgroundColor: C.surface,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#6B5849",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: C.ivory, fontWeight: "900" },
  activityText: { color: C.ivory, fontSize: 12, lineHeight: 17 },
  activityEm: { color: C.teal, fontStyle: "italic" },
  activityMeta: { color: C.muted, fontSize: 10, marginTop: 3 },
  tasteCta: { flexDirection: "row", alignItems: "center", gap: 12, padding: 15, borderRadius: 18, backgroundColor: "#12322D", borderWidth: 1, borderColor: "#236256" },
  tasteCtaIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: C.teal },
  tasteCtaTitle: { color: C.ivory, fontSize: 13, lineHeight: 17, fontWeight: "900" },
  display: {
    color: C.ivory,
    fontSize: 34,
    lineHeight: 37,
    letterSpacing: -1.6,
    fontWeight: "800",
    marginBottom: 21,
  },
  chips: { gap: 8, paddingBottom: 25 },
  chip: {
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
  },
  chipActive: { backgroundColor: C.gold, borderColor: C.gold },
  chipText: { color: C.muted, fontSize: 10, fontWeight: "800" },
  chipTextActive: { color: C.ink },
  discoverGrid: { gap: 12 },
  emptyState: {
    minHeight: 190,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: { color: C.ivory, fontSize: 16, fontWeight: "800", marginTop: 12 },
  emptyText: { color: C.muted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 7 },
  emptyShelf: {
    minHeight: 170,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.line,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  wideCard: {
    height: 126,
    borderRadius: 19,
    overflow: "hidden",
    backgroundColor: C.surface,
  },
  wideImage: { width: "100%", height: "100%" },
  wideTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  wideMeta: { color: "#D4D8D5", fontSize: 11, marginTop: 3 },
  searchBox: {
    height: 53,
    borderRadius: 15,
    paddingHorizontal: 15,
    backgroundColor: C.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: C.line,
  },
  searchInput: { flex: 1, color: C.ivory, fontSize: 14, height: "100%" },
  searchPage: { flex: 1 },
  searchTypeRail: { gap: 8, paddingBottom: 14, paddingRight: 20 },
  searchType: { height: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: C.line, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surface },
  searchTypeActive: { backgroundColor: C.gold, borderColor: C.gold },
  searchTypeText: { color: C.muted, fontSize: 10, fontWeight: "900" },
  searchTypeTextActive: { color: C.ink },
  resultLabel: {
    color: C.muted,
    fontSize: 9,
    letterSpacing: 1.3,
    fontWeight: "900",
    marginTop: 25,
    marginBottom: 10,
  },
  searchResults: { gap: 9 },
  searchCardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 11 },
  searchCard: { width: "48%", height: 244, overflow: "hidden", borderRadius: 18, backgroundColor: C.surface },
  searchCardImage: { width: "100%", height: "100%", backgroundColor: C.surface2 },
  searchCardInfo: { position: "absolute", left: 11, right: 10, bottom: 11 },
  searchRow: {
    minHeight: 86,
    backgroundColor: C.surface,
    borderRadius: 15,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  searchImage: {
    width: 52,
    height: 68,
    borderRadius: 10,
    backgroundColor: C.surface2,
  },
  searchTitle: {
    color: C.ivory,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 4,
  },
  searchMeta: { color: C.muted, fontSize: 11, marginTop: 4 },
  libraryStats: {
    padding: 19,
    borderRadius: 20,
    backgroundColor: C.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 21,
    marginBottom: 36,
  },
  libraryFilters: { gap: 8, paddingBottom: 22 },
  smartShelfLabel: { color: C.muted, fontSize: 9, letterSpacing: 1.2, fontWeight: "900", marginBottom: 10 },
  smartShelfRail: { gap: 9, paddingBottom: 27, paddingRight: 20 },
  smartShelf: { width: 126, minHeight: 103, padding: 13, borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  smartShelfTitle: { color: C.ivory, fontSize: 13, fontWeight: "900", marginTop: 11 },
  smartShelfMeta: { color: C.muted, fontSize: 10, marginTop: 3 },
  collectionCreateRow: { height: 48, flexDirection: "row", gap: 8 },
  collectionInput: { flex: 1, height: 48, paddingHorizontal: 13, borderRadius: 14, color: C.ivory, fontSize: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  collectionCreateButton: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.teal },
  collectionMessage: { color: C.teal, fontSize: 10, marginTop: 8 },
  collectionRail: { gap: 10, paddingTop: 13, paddingRight: 20 },
  collectionCard: { width: 158, minHeight: 116, borderRadius: 18, padding: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  collectionCardIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: C.teal, alignItems: "center", justifyContent: "center" },
  collectionCardTitle: { color: C.ivory, fontSize: 14, lineHeight: 17, fontWeight: "900", marginTop: 11 },
  collectionCardMeta: { color: C.muted, fontSize: 9, marginTop: 4 },
  collectionVisibility: { alignSelf: "flex-start", marginTop: 8, paddingVertical: 4 },
  collectionVisibilityText: { color: C.teal, fontSize: 8, letterSpacing: 0.6, fontWeight: "900" },
  collectionEmpty: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 13 },
  libraryFilter: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  libraryFilterActive: { borderColor: C.teal, backgroundColor: "rgba(68,221,193,.13)" },
  libraryFilterText: { color: C.muted, fontSize: 10, fontWeight: "800" },
  libraryFilterTextActive: { color: C.teal },
  statNum: { color: C.ivory, fontSize: 26, fontWeight: "800" },
  statLabel: {
    color: C.muted,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "900",
    marginTop: 3,
  },
  statDivider: { width: 1, height: 35, backgroundColor: C.line },
  addCircle: {
    marginLeft: "auto",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  libraryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  libraryCard: {
    width: "48%",
    height: 252,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: C.surface2,
  },
  libraryCardImage: { width: "100%", height: "100%" },
  libraryCardTop: {
    position: "absolute",
    top: 10,
    left: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(10,17,15,.78)",
  },
  libraryCardInfo: { position: "absolute", left: 11, right: 11, bottom: 11 },
  libraryCardTitle: { color: "#FFF", fontSize: 16, lineHeight: 18, fontWeight: "900", letterSpacing: -0.4 },
  libraryCardMeta: { color: "#CFD6D1", fontSize: 10, marginTop: 4 },
  libraryProgress: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,.25)", marginTop: 9 },
  libraryProgressFill: { width: "62%", height: 3, borderRadius: 2, backgroundColor: C.teal },
  profile: { alignItems: "center", marginVertical: 12 },
  profileAvatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "#765542",
    borderWidth: 3,
    borderColor: C.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  profileMark: { width: 56, height: 56, borderRadius: 17 },
  profileInitials: { color: C.ivory, fontSize: 23, fontWeight: "900" },
  profileName: {
    color: C.ivory,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 12,
  },
  profileHandle: { color: C.muted, fontSize: 12, marginTop: 3 },
  accountCard: { padding: 17, borderRadius: 20, backgroundColor: "#12322D", borderWidth: 1, borderColor: "#236256", marginTop: 12, marginBottom: 2 },
  accountTitle: { color: C.ivory, fontSize: 18, letterSpacing: -0.4, fontWeight: "900", marginTop: 7 },
  accountText: { color: "#B7D3CB", fontSize: 11, lineHeight: 16, marginTop: 7 },
  accountInput: { height: 47, paddingHorizontal: 12, borderRadius: 12, color: C.ivory, backgroundColor: C.ink, marginTop: 14, fontSize: 13 },
  accountButton: { minHeight: 45, borderRadius: 13, backgroundColor: C.teal, marginTop: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  accountMessage: { color: C.teal, fontSize: 10, lineHeight: 14, marginTop: 10 },
  tasteCard: {
    marginTop: 26,
    padding: 21,
    borderRadius: 21,
    backgroundColor: C.surface,
    marginBottom: 37,
  },
  creditsCard: { padding: 15, borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, marginTop: -8 },
  creditsText: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 7 },
  reminderCard: { minHeight: 78, padding: 13, borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, flexDirection: "row", alignItems: "center", gap: 11 },
  reminderCardActive: { borderColor: "#236256", backgroundColor: "#12322D" },
  reminderIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.surface2 },
  reminderIconActive: { backgroundColor: C.teal },
  reminderTitle: { color: C.ivory, fontSize: 13, fontWeight: "900" },
  reminderText: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  reminderSwitch: { width: 38, height: 23, borderRadius: 12, padding: 3, backgroundColor: C.line },
  reminderSwitchActive: { backgroundColor: C.teal },
  reminderKnob: { width: 17, height: 17, borderRadius: 9, backgroundColor: C.ivory },
  reminderKnobActive: { alignSelf: "flex-end", backgroundColor: C.ink },
  tasteTitle: {
    color: C.ivory,
    fontSize: 29,
    lineHeight: 31,
    letterSpacing: -1.1,
    fontWeight: "800",
    marginTop: 8,
  },
  retakeTaste: { marginTop: 19, paddingTop: 13, borderTopWidth: 1, borderTopColor: C.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  retakeTasteText: { color: C.teal, fontSize: 9, letterSpacing: 0.8, fontWeight: "900" },
  tagRow: { flexDirection: "row", gap: 7, marginTop: 17 },
  tag: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  tagText: { color: C.ivory, fontSize: 10 },
  yearRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: C.surface,
    padding: 18,
    borderRadius: 18,
  },
  nav: {
    height: Platform.OS === "web" ? 62 : 73,
    backgroundColor: "rgba(14,21,19,.96)",
    borderTopWidth: 1,
    borderTopColor: C.line,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingBottom: 3,
  },
  navItem: { alignItems: "center", minWidth: 46 },
  navText: { color: C.muted, fontSize: 8, fontWeight: "800", marginTop: 4 },
  navTextActive: { color: C.gold },
  navDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.gold,
    marginTop: 3,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
    backgroundColor: "rgba(0,0,0,.62)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "86%",
    backgroundColor: "#18211F",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
  },
  sharedSheet: { minHeight: "58%", paddingTop: 54 },
  sharedTitle: { color: C.ivory, fontSize: 28, lineHeight: 31, letterSpacing: -1, fontWeight: "900", marginTop: 8, paddingRight: 35 },
  sharedDescription: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  sharedList: { gap: 8, paddingTop: 19, paddingBottom: 12 },
  sharedItem: { minHeight: 77, borderRadius: 14, padding: 8, backgroundColor: C.surface, flexDirection: "row", gap: 10, alignItems: "center" },
  sharedPoster: { width: 43, height: 60, borderRadius: 8, backgroundColor: C.surface2 },
  sharedItemTitle: { color: C.ivory, fontSize: 14, fontWeight: "900", marginTop: 3 },
  sharedItemMeta: { color: C.muted, fontSize: 10, marginTop: 3 },
  detailScroll: { paddingBottom: 18 },
  grab: {
    width: 37,
    height: 4,
    borderRadius: 3,
    backgroundColor: C.muted,
    alignSelf: "center",
    marginBottom: 17,
  },
  close: {
    position: "absolute",
    zIndex: 2,
    right: 16,
    top: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface2,
  },
  detailTop: { flexDirection: "row", gap: 14, paddingRight: 28 },
  detailPoster: {
    width: 92,
    height: 124,
    borderRadius: 14,
    backgroundColor: C.surface2,
  },
  detailTitle: {
    color: C.ivory,
    fontSize: 24,
    letterSpacing: -0.8,
    fontWeight: "800",
    marginTop: 4,
  },
  detailMeta: { color: C.muted, fontSize: 11, marginTop: 4 },
  detailBody: { color: "#BEC7C2", fontSize: 11, lineHeight: 16, marginTop: 10 },
  genreRow: { flexDirection: "row", gap: 7, flexWrap: "wrap", marginTop: 16 },
  genrePill: { backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  genreText: { color: C.muted, fontSize: 9, fontWeight: "800" },
  trackerCard: { marginTop: 20, padding: 14, borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  trackerTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  trackerTitle: { color: C.ivory, fontSize: 14, fontWeight: "900", marginTop: 5 },
  trackerActions: { flexDirection: "row", gap: 8, marginTop: 13 },
  trackerStep: { flex: 1, minHeight: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line },
  trackerStepActive: { backgroundColor: "rgba(68,221,193,.16)", borderColor: C.teal },
  trackerStepText: { color: C.muted, fontSize: 10, fontWeight: "900" },
  trackerStepTextActive: { color: C.teal },
  bookProgressBar: { height: 7, borderRadius: 4, overflow: "hidden", backgroundColor: C.surface2, marginTop: 15 },
  bookProgressFill: { height: "100%", borderRadius: 4, backgroundColor: kindAccent.BOOK },
  seasonBlock: { marginTop: 3 },
  episodeHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  episodeCount: { color: C.teal, fontSize: 9, fontWeight: "900", letterSpacing: 0.7, marginTop: 14 },
  seasonChips: { gap: 7, paddingBottom: 4 },
  seasonChip: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  seasonChipActive: { backgroundColor: C.teal, borderColor: C.teal },
  seasonChipText: { color: C.muted, fontSize: 10, fontWeight: "900" },
  seasonChipTextActive: { color: C.ink },
  loadingText: { color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 18 },
  detailLabel: {
    color: C.muted,
    fontSize: 9,
    letterSpacing: 1.3,
    fontWeight: "900",
    marginTop: 22,
    marginBottom: 9,
  },
  episode: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 9,
    marginBottom: 7,
    backgroundColor: C.surface,
    borderRadius: 13,
  },
  episodeRow: { flexDirection: "row", alignItems: "stretch", gap: 7 },
  episodeNote: {
    width: 43,
    marginBottom: 7,
    borderRadius: 13,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  episodeNum: {
    color: C.ink,
    backgroundColor: C.gold,
    width: 27,
    height: 27,
    textAlign: "center",
    textAlignVertical: "center",
    borderRadius: 14,
    fontSize: 11,
    fontWeight: "900",
  },
  episodeTitle: { color: C.ivory, fontSize: 12, fontWeight: "700" },
  episodeMeta: { color: C.muted, fontSize: 10, marginTop: 3 },
  reviewEditor: { marginTop: 8, padding: 13, borderRadius: 15, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  reviewHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  reviewTitle: { color: C.ivory, fontSize: 13, fontWeight: "800", marginTop: 3 },
  reviewClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  reviewInput: { minHeight: 74, color: C.ivory, fontSize: 12, lineHeight: 17, textAlignVertical: "top", marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: C.ink },
  reviewFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 11 },
  reviewStars: { flexDirection: "row", gap: 5 },
  reviewSave: { backgroundColor: C.teal, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  titleReviewCard: { marginTop: 23, padding: 14, borderRadius: 17, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  titleReviewTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleReviewTitle: { color: C.ivory, fontSize: 14, fontWeight: "800", marginTop: 4 },
  titleReviewInput: { minHeight: 84, color: C.ivory, fontSize: 12, lineHeight: 18, textAlignVertical: "top", marginTop: 12, padding: 11, borderRadius: 11, backgroundColor: C.ink },
  titleReviewFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 11 },
  noteHelper: { flex: 1, color: C.muted, fontSize: 10 },
  titleReviewSave: { backgroundColor: C.teal, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 9 },
  stars: { flexDirection: "row", gap: 12 },
  detailActions: { flexDirection: "row", gap: 9, marginTop: 21 },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: C.ivory, fontSize: 12, fontWeight: "800" },
  primaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.gold,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: C.ink, fontSize: 12, fontWeight: "900" },
  completeBtn: { minHeight: 38, marginTop: 10, borderRadius: 12, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  completeText: { color: C.teal, fontSize: 11, fontWeight: "900" },
  addCollectionBtn: { minHeight: 35, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  addCollectionText: { fontSize: 10, fontWeight: "900" },
  shareReccoBtn: { minHeight: 35, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  shareReccoText: { color: C.muted, fontSize: 10, fontWeight: "800" },
  onboard: {
    ...StyleSheet.absoluteFill,
    zIndex: 25,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "web" ? 47 : 22,
    paddingBottom: Platform.OS === "web" ? 14 : 20,
    backgroundColor: C.ink,
  },
  onboardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  onboardStep: { color: C.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  onboardArt: {
    height: Platform.OS === "web" ? 184 : 285,
    borderRadius: 24,
    overflow: "hidden",
    marginTop: Platform.OS === "web" ? 17 : 28,
  },
  onboardOrbOne: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(68,221,193,.22)", right: -36, top: -40 },
  onboardOrbTwo: { position: "absolute", width: 150, height: 150, borderRadius: 75, borderWidth: 1, borderColor: "rgba(232,230,222,.3)", left: -35, bottom: -62 },
  onboardMark: { position: "absolute", width: 74, height: 74, borderRadius: 37, backgroundColor: C.teal, alignItems: "center", justifyContent: "center", right: 23, bottom: 22, overflow: "hidden" },
  onboardMarkImage: { width: 64, height: 64, borderRadius: 20 },
  onboardArtText: {
    position: "absolute",
    left: 18,
    bottom: 18,
    color: "#FFF",
    fontSize: 31,
    lineHeight: 31,
    letterSpacing: -1.4,
    fontWeight: "900",
  },
  onboardCopy: { marginTop: Platform.OS === "web" ? 17 : 29 },
  onboardTitle: {
    color: C.ivory,
    fontSize: Platform.OS === "web" ? 27 : 32,
    lineHeight: Platform.OS === "web" ? 29 : 35,
    letterSpacing: -1.4,
    fontWeight: "800",
    marginTop: 9,
  },
  onboardBody: {
    color: "#B7C0BA",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  onboardChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 21 },
  onboardChoice: { minHeight: 39, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, flexDirection: "row", alignItems: "center", gap: 6 },
  onboardChoiceActive: { borderColor: C.teal, backgroundColor: C.teal },
  onboardChoiceText: { color: C.ivory, fontSize: 11, fontWeight: "800" },
  onboardChoiceTextActive: { color: C.ink },
  onboardButton: {
    height: 54,
    borderRadius: 15,
    backgroundColor: C.gold,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: "auto",
  },
  onboardFine: {
    color: C.muted,
    textAlign: "center",
    fontSize: 10,
    marginTop: 13,
  },
  curationCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 17,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
    borderWidth: 1,
    borderColor: C.line,
  },
  curationTitle: {
    color: C.ivory,
    fontSize: 20,
    lineHeight: 21,
    fontWeight: "800",
    marginTop: 6,
  },
  curationText: { color: C.muted, fontSize: 11, marginTop: 6 },
  curationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  swipePage: {
    ...StyleSheet.absoluteFill,
    zIndex: 24,
    backgroundColor: C.ink,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "web" ? 24 : 10,
  },
  swipeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  swipeClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
  },
  swipeCount: {
    color: C.ivory,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  swipeIntro: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 14, marginHorizontal: 7, marginBottom: 12 },
  swipeIntroTitle: { color: C.ivory, fontSize: 18, letterSpacing: -0.4, fontWeight: "900" },
  swipeIntroHint: { color: C.muted, fontSize: 10, fontWeight: "800" },
  swipeTitle: {
    color: C.ivory,
    fontSize: 37,
    lineHeight: 37,
    letterSpacing: -1.8,
    fontWeight: "900",
    marginTop: 18,
  },
  swipeHint: { color: C.muted, fontSize: 12, marginTop: 7, marginBottom: 19 },
  deck: { position: "relative", marginHorizontal: 1 },
  nextDeckCard: {
    position: "absolute",
    inset: 0,
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: C.surface2,
  },
  peekDeckCard: { transform: [{ scale: 0.975 }, { translateY: 13 }], opacity: 0.86 },
  thirdDeckCard: { transform: [{ scale: 0.94 }, { translateY: 25 }], opacity: 0.5 },
  nextDeckInfo: { position: "absolute", left: 18, right: 18, bottom: 18 },
  nextDeckTitle: { color: "#FFF", fontSize: 26, lineHeight: 28, fontWeight: "900", letterSpacing: -0.8 },
  nextDeckMeta: { color: "#D2D8D4", fontSize: 12, marginTop: 5 },
  deckCard: {
    position: "absolute",
    inset: 0,
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: C.surface,
  },
  deckPreviewButton: { position: "absolute", right: 18, top: 18, zIndex: 3, height: 34, paddingHorizontal: 10, borderRadius: 17, backgroundColor: "rgba(8,13,12,.75)", flexDirection: "row", alignItems: "center", gap: 5 },
  deckPreviewText: { color: C.ivory, fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  deckImage: { width: "100%", height: "100%" },
  swipeStamp: {
    position: "absolute",
    top: 21,
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  saveStamp: {
    right: 18,
    borderColor: C.teal,
    transform: [{ rotate: "10deg" }],
  },
  passStamp: {
    left: 18,
    borderColor: "#E9917A",
    transform: [{ rotate: "-10deg" }],
  },
  saveStampText: {
    color: C.teal,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  passStampText: {
    color: "#E9917A",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  deckInfo: { position: "absolute", left: 22, right: 22, bottom: 24 },
  deckTitle: {
    color: "#FFF",
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -1,
  },
  deckFacts: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 5 },
  deckMeta: { color: "#D2D8D4", fontSize: 12 },
  deckGenres: { color: C.teal, fontSize: 10, fontWeight: "800", marginTop: 7 },
  deckScore: { color: C.teal, fontSize: 12, fontWeight: "900" },
  deckNote: { color: "#B9C2BD", fontSize: 12, lineHeight: 17, marginTop: 10 },
  swipeActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    alignItems: "center",
    marginTop: 14,
  },
  vibePanel: { marginTop: 14, marginHorizontal: 7 },
  vibePanelTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  vibePrompt: { color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  vibeCount: { color: C.teal, fontSize: 10, fontWeight: "800" },
  vibeRail: { gap: 7, paddingRight: 20 },
  vibeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  vibeChipActive: { backgroundColor: "rgba(68,221,193,.16)", borderColor: C.teal },
  vibeChipText: { color: C.muted, fontSize: 10, fontWeight: "800" },
  vibeChipTextActive: { color: C.teal },
  signalAction: { alignItems: "center", gap: 6 },
  signalLabel: { color: C.muted, fontSize: 9, fontWeight: "800" },
  passAction: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
  },
  notForMeAction: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#6A3D38",
  },
  keepAction: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  loveAction: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: C.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  swipeDone: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingBottom: 80 },
  swipeDoneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.teal, alignItems: "center", justifyContent: "center" },
  swipeDoneTitle: { color: C.ivory, fontSize: 30, fontWeight: "900", letterSpacing: -1, marginTop: 20 },
  swipeDoneText: { color: C.muted, textAlign: "center", fontSize: 13, lineHeight: 19, marginTop: 9 },
  doneButton: { marginTop: 23, backgroundColor: C.teal, borderRadius: 13, paddingHorizontal: 18, paddingVertical: 13 },
  doneButtonText: { color: C.ink, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
});
