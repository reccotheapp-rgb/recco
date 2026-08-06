import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  continueItems,
  picks,
  showEpisodes,
  upcomingItems,
} from "./src/data/media";
import type { MediaItem as Media, MediaKind as Kind } from "./src/types/media";
import { getTitleDetails, getTrendingMedia, searchMedia } from "./src/services/media";
import { ensureGuestSession, syncMediaState } from "./src/services/supabase";

type Tab = "Home" | "Discover" | "Search" | "Library" | "Profile";
const allMedia = [...picks, ...continueItems, ...upcomingItems];
const kindIcon: Record<Kind, keyof typeof Ionicons.glyphMap> = {
  FILM: "film-outline",
  SHOW: "tv-outline",
  BOOK: "book-outline",
  ALBUM: "musical-notes-outline",
};

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
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Pressable
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
      </Pressable>
    </Animated.View>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("Home");
  const [selected, setSelected] = useState<Media | null>(null);
  const [saved, setSaved] = useState<string[]>(["after-yang"]);
  const [tracked, setTracked] = useState<string[]>(["severance", "klara"]);
  const [rating, setRating] = useState<Record<string, number>>({
    severance: 5,
  });
  const [completed, setCompleted] = useState<string[]>([]);
  const [episodeProgress, setEpisodeProgress] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | Kind>("ALL");
  const [remoteResults, setRemoteResults] = useState<Media[]>([]);
  const [trending, setTrending] = useState<Media[]>([]);
  const [searching, setSearching] = useState(false);
  const [onboarding, setOnboarding] = useState(true);
  const [curating, setCurating] = useState(false);
  const buzz = () =>
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
  const open = (item: Media) => {
    buzz();
    setSelected(item);
  };
  const save = (id: string) => {
    buzz();
    setSaved((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
    const item =
      selected?.id === id
        ? selected
        : allMedia.find((media) => media.id === id);
    if (item) void syncMediaState(item, "SAVED").catch(() => undefined);
  };
  const track = (id: string) => {
    buzz();
    setTracked((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
    const item =
      selected?.id === id
        ? selected
        : allMedia.find((media) => media.id === id);
    if (item)
      void syncMediaState(item, "IN_PROGRESS", rating[id]).catch(
        () => undefined,
      );
  };
  const liveCatalog = trending.length ? trending : allMedia;
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
  useEffect(() => {
    void ensureGuestSession().catch(() => undefined);
    void getTrendingMedia()
      .then(setTrending)
      .catch(() => undefined);
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
        };
        setSaved(data.saved ?? []);
        setTracked(data.tracked ?? []);
        setRating(data.rating ?? {});
        setCompleted(data.completed ?? []);
        setEpisodeProgress(data.episodeProgress ?? {});
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(
      "recco-library-v1",
      JSON.stringify({ saved, tracked, rating, completed, episodeProgress }),
    );
  }, [saved, tracked, rating, completed, episodeProgress, hydrated]);
  useEffect(() => {
    if (query.trim().length < 2) {
      setRemoteResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    const timeout = setTimeout(() => {
      setSearching(true);
      searchMedia(query)
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
  }, [query]);

  const Header = ({ label }: { label?: string }) => (
    <View style={styles.header}>
      <Text style={styles.brand}>Recco</Text>
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
      <LinearGradient
        colors={["transparent", "rgba(6,10,9,.92)"]}
        style={styles.posterShade}
      />
      <View style={styles.posterInfo}>
        <Text style={styles.mediaKind}>{item.kind}</Text>
        <Text
          numberOfLines={1}
          style={wide ? styles.wideTitle : styles.posterTitle}
        >
          {item.title}
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

  const heroItem = trending[0] ?? picks[0];
  const Home = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      <Header />
      <Tap onPress={() => open(heroItem)} style={styles.hero}>
        <Image source={{ uri: heroItem.image }} style={styles.heroImage} />
        <LinearGradient
          colors={["rgba(8,13,12,.12)", "rgba(8,13,12,.96)"]}
          style={styles.heroShade}
        />
        <View style={styles.heroTop}>
          <Text style={styles.heroEyebrow}>CURATED RECOMMENDATION</Text>
          <View style={styles.match}>
            <Ionicons name="sparkles" size={12} color={C.ink} />
            <Text style={styles.matchText}>96% FOR YOU</Text>
          </View>
        </View>
        <View style={styles.heroBottom}>
          <Text style={styles.heroTitle}>{heroItem.title}</Text>
          <Text style={styles.heroBody}>
            {heroItem.note || "Trending now on TMDB."}
          </Text>
          <View style={styles.heroButton}>
            <Text style={styles.heroButtonText}>Explore the Recco</Text>
            <Ionicons name="arrow-forward" size={16} color={C.ink} />
          </View>
        </View>
      </Tap>
      <Section title="Continue tracking" action="VIEW ALL">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {(trending.length ? trending.slice(1, 4) : continueItems).map(
            (item) => (
              <View key={item.id}>
                <Poster item={item} />
                <Text numberOfLines={1} style={styles.railTitle}>
                  {item.title}
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
      <Section title="Inspired by your taste">
        <View style={styles.wall}>
          {(trending.length ? trending.slice(4, 8) : picks.slice(1)).map(
            (item) => (
              <Poster item={item} key={item.id} />
            ),
          )}
        </View>
      </Section>
      <Section title="From your circle">
        <Tap onPress={() => setTab("Profile")} style={styles.activity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>J</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.activityText}>
              Julian finished{" "}
              <Text style={styles.activityEm}>Blade Runner 2049</Text>
            </Text>
            <Text style={styles.activityMeta}>★★★★★ · 2h ago</Text>
          </View>
          <Ionicons name="heart-outline" size={20} color={C.ivory} />
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
            Swipe through handpicked titles.
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
        {(["ALL", "FILM", "SHOW"] as const).map((item) => (
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
              Live film and series recommendations will appear here in a moment.
            </Text>
          </View>
        )}
      </Section>
    </ScrollView>
  );
  const Search = () => (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.scroll}
    >
      <Header label="SEARCH" />
      <Text style={styles.display}>Find anything.</Text>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={19} color={C.muted} />
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Titles, people, artists..."
          placeholderTextColor={C.muted}
          style={styles.searchInput}
        />
      </View>
      <Text style={styles.resultLabel}>
        {searching
          ? "SEARCHING TMDB..."
          : query
            ? `${remoteResults.length} RESULTS`
            : "START EXPLORING"}
      </Text>
      <View style={styles.searchResults}>
        {(query ? remoteResults : results).map((item) => (
          <Tap
            key={item.id}
            onPress={() => open(item)}
            style={styles.searchRow}
          >
            <Image source={{ uri: item.image }} style={styles.searchImage} />
            <View style={{ flex: 1 }}>
              <Text style={styles.mediaKind}>{item.kind}</Text>
              <Text style={styles.searchTitle}>{item.title}</Text>
              <Text style={styles.searchMeta}>
                {item.by} · {item.year}
              </Text>
            </View>
            <Ionicons name="arrow-up-outline" size={17} color={C.gold} />
          </Tap>
        ))}
      </View>
    </ScrollView>
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
      <Section title="On your shelves">
        {allMedia
          .filter(
            (item) => tracked.includes(item.id) || saved.includes(item.id),
          )
          .map((item) => (
            <Tap
              key={item.id}
              onPress={() => open(item)}
              style={styles.libraryRow}
            >
              <Image source={{ uri: item.image }} style={styles.libraryImage} />
              <View style={{ flex: 1 }}>
                <Text style={styles.mediaKind}>
                  {tracked.includes(item.id)
                    ? "IN PROGRESS"
                    : "SAVED FOR LATER"}
                </Text>
                <Text style={styles.searchTitle}>{item.title}</Text>
                <Text style={styles.searchMeta}>{item.by}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Tap>
          ))}
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
          <Text style={styles.profileInitials}>NS</Text>
        </View>
        <Text style={styles.profileName}>Nastia S.</Text>
        <Text style={styles.profileHandle}>@nastia</Text>
      </View>
      <View style={styles.tasteCard}>
        <Text style={styles.mediaKind}>YOUR TASTE, IN ONE LINE</Text>
        <Text style={styles.tasteTitle}>Tender hearts.{`\n`}Big ideas.</Text>
        <View style={styles.tagRow}>
          {["Sci-fi", "Literary", "Dream pop"].map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
      <Section title="This year">
        <View style={styles.yearRow}>
          <Stat value="148" label="TRACKED" />
          <Stat value="26" label="LISTS" />
          <Stat value="48" label="FRIENDS" />
        </View>
      </Section>
    </ScrollView>
  );
  const page =
    tab === "Home" ? (
      <Home />
    ) : tab === "Discover" ? (
      <Discover />
    ) : tab === "Search" ? (
      <Search />
    ) : tab === "Library" ? (
      <Library />
    ) : (
      <Profile />
    );
  return (
    <View style={styles.canvas}>
      <SafeAreaView style={styles.app}>
        <StatusBar style="light" />
        <View style={styles.stage}>{page}</View>
        <Nav
          active={tab}
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
            onClose={() => setSelected(null)}
            onSave={() => save(selected.id)}
            onTrack={() => track(selected.id)}
            onRate={(value) =>
              setRating((values) => ({ ...values, [selected.id]: value }))
            }
            onEpisodeToggle={(id) =>
              setEpisodeProgress((values) => ({ ...values, [id]: !values[id] }))
            }
          />
        )}
        {curating && (
          <SwipeDeck onClose={() => setCurating(false)} onSave={save} />
        )}
        {onboarding && <Onboarding onDone={() => setOnboarding(false)} />}
      </SafeAreaView>
    </View>
  );
}

function Nav({
  active,
  onChange,
}: {
  active: Tab;
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
    <View style={styles.nav}>
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
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const card = useRef(new Animated.ValueXY()).current;
  const item = picks[index % picks.length];
  const next = picks[(index + 1) % picks.length];
  const advance = (save: boolean) =>
    Animated.timing(card, {
      toValue: { x: save ? 500 : -500, y: 25 },
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      if (save) onSave(item.id);
      card.setValue({ x: 0, y: 0 });
      setIndex((value) => value + 1);
    });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 7,
        onPanResponderMove: Animated.event([null, { dx: card.x, dy: card.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_, gesture) =>
          gesture.dx > 85
            ? advance(true)
            : gesture.dx < -85
              ? advance(false)
              : Animated.spring(card, {
                  toValue: { x: 0, y: 0 },
                  useNativeDriver: true,
                  speed: 18,
                  bounciness: 7,
                }).start(),
      }),
    [item.id],
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
  return (
    <View style={styles.swipePage}>
      <View style={styles.swipeHeader}>
        <Tap onPress={onClose} style={styles.swipeClose}>
          <Ionicons name="close" size={20} color={C.ivory} />
        </Tap>
        <View>
          <Text style={styles.heroEyebrow}>TASTE CURATION</Text>
          <Text style={styles.swipeCount}>
            {String((index % picks.length) + 1).padStart(2, "0")} /{" "}
            {String(picks.length).padStart(2, "0")}
          </Text>
        </View>
      </View>
      <Text style={styles.swipeTitle}>Trust your{`\n`}taste.</Text>
      <Text style={styles.swipeHint}>Swipe right to keep, left to pass.</Text>
      <View style={styles.deck}>
        <View style={styles.nextDeckCard}>
          <Image source={{ uri: next.image }} style={styles.deckImage} />
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
            <Text style={styles.saveStampText}>KEEP</Text>
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
          <View style={styles.deckInfo}>
            <Text style={styles.mediaKind}>{item.kind}</Text>
            <Text style={styles.deckTitle}>{item.title}</Text>
            <Text style={styles.deckMeta}>
              {item.by} · {item.year}
            </Text>
            <Text style={styles.deckNote}>{item.note}</Text>
          </View>
        </Animated.View>
      </View>
      <View style={styles.swipeActions}>
        <Tap onPress={() => advance(false)} style={styles.passAction}>
          <Ionicons name="close" size={25} color="#E9917A" />
        </Tap>
        <Tap onPress={() => advance(true)} style={styles.keepAction}>
          <Ionicons name="bookmark" size={20} color={C.ink} />
        </Tap>
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
  onClose,
  onSave,
  onTrack,
  onRate,
  onEpisodeToggle,
}: {
  item: Media;
  saved: boolean;
  tracked: boolean;
  rating: number;
  episodeProgress: Record<string, boolean>;
  onClose: () => void;
  onSave: () => void;
  onTrack: () => void;
  onRate: (value: number) => void;
  onEpisodeToggle: (id: string) => void;
}) {
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getTitleDetails>>>(null);
  const [season, setSeason] = useState<number | undefined>();
  const [loadingDetails, setLoadingDetails] = useState(item.id.startsWith("tmdb-tv-"));
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
  const episodes = details?.episodes ?? showEpisodes[item.id] ?? [];
  const watchedEpisodes = episodes.filter((episode) => episodeProgress[episode.id]).length;
  const description = details?.overview || item.note || "Save it now and pick it up when the moment is right.";
  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <View style={styles.grab} />
        <Tap onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={20} color={C.ivory} />
        </Tap>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.detailTop}>
            <Image source={{ uri: item.image }} style={styles.detailPoster} />
            <View style={{ flex: 1 }}>
              <Text style={styles.mediaKind}>{item.kind}</Text>
              <Text style={styles.detailTitle}>{item.title}</Text>
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
                <Tap key={episode.id} onPress={() => onEpisodeToggle(episode.id)} style={styles.episode}>
                  <Text style={styles.episodeNum}>{episode.number}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.episodeTitle}>{episode.title}</Text>
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
              ))}
            </>
          )}
          {loadingDetails && item.kind === "SHOW" && (
            <Text style={styles.loadingText}>LOADING EPISODES…</Text>
          )}
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
        </ScrollView>
      </View>
    </View>
  );
}
function Onboarding({ onDone }: { onDone: () => void }) {
  return (
    <View style={styles.onboard}>
      <Text style={styles.brand}>Recco</Text>
      <View style={styles.onboardArt}>
        <Image source={{ uri: picks[0].image }} style={styles.onboardImage} />
        <LinearGradient
          colors={["transparent", "rgba(8,13,12,.95)"]}
          style={styles.posterShade}
        />
        <Text style={styles.onboardArtText}>Your media,{`\n`}remembered.</Text>
      </View>
      <View style={styles.onboardCopy}>
        <Text style={styles.heroEyebrow}>A PERSONAL MEDIA TRACKER</Text>
        <Text style={styles.onboardTitle}>
          Keep every story{`\n`}that moved you.
        </Text>
        <Text style={styles.onboardBody}>
          Track what you watch, read and listen to. Recco turns your history
          into your next great find.
        </Text>
      </View>
      <Tap onPress={onDone} style={styles.onboardButton}>
        <Text style={styles.primaryText}>Begin your archive</Text>
        <Ionicons name="arrow-forward" size={18} color={C.ink} />
      </Tap>
      <Text style={styles.onboardFine}>Your taste stays yours.</Text>
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
    paddingTop: Platform.OS === "web" ? 48 : 18,
    paddingHorizontal: Platform.OS === "web" ? 17 : 20,
    paddingBottom: Platform.OS === "web" ? 84 : 105,
  },
  header: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Platform.OS === "web" ? 17 : 25,
  },
  brand: {
    color: C.teal,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -1.4,
  },
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
  posterShade: { ...StyleSheet.absoluteFill },
  posterInfo: { position: "absolute", left: 10, right: 9, bottom: 9 },
  mediaKind: {
    color: C.teal,
    fontSize: 8,
    letterSpacing: 1.1,
    fontWeight: "900",
  },
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
  resultLabel: {
    color: C.muted,
    fontSize: 9,
    letterSpacing: 1.3,
    fontWeight: "900",
    marginTop: 25,
    marginBottom: 10,
  },
  searchResults: { gap: 9 },
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
  libraryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 9,
    marginBottom: 9,
  },
  libraryImage: {
    width: 52,
    height: 66,
    borderRadius: 10,
    backgroundColor: C.surface2,
  },
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
  profileInitials: { color: C.ivory, fontSize: 23, fontWeight: "900" },
  profileName: {
    color: C.ivory,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 12,
  },
  profileHandle: { color: C.muted, fontSize: 12, marginTop: 3 },
  tasteCard: {
    marginTop: 26,
    padding: 21,
    borderRadius: 21,
    backgroundColor: C.surface,
    marginBottom: 37,
  },
  tasteTitle: {
    color: C.ivory,
    fontSize: 29,
    lineHeight: 31,
    letterSpacing: -1.1,
    fontWeight: "800",
    marginTop: 8,
  },
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
    zIndex: 20,
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
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 9,
    marginBottom: 7,
    backgroundColor: C.surface,
    borderRadius: 13,
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
  onboard: {
    ...StyleSheet.absoluteFill,
    zIndex: 25,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "web" ? 47 : 22,
    paddingBottom: Platform.OS === "web" ? 14 : 20,
    backgroundColor: C.ink,
  },
  onboardArt: {
    height: Platform.OS === "web" ? 184 : 285,
    borderRadius: 24,
    overflow: "hidden",
    marginTop: Platform.OS === "web" ? 17 : 28,
  },
  onboardImage: { width: "100%", height: "100%" },
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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "web" ? 47 : 22,
  },
  swipeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  swipeClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
  },
  swipeCount: {
    color: C.ivory,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  swipeTitle: {
    color: C.ivory,
    fontSize: 37,
    lineHeight: 37,
    letterSpacing: -1.8,
    fontWeight: "900",
    marginTop: 25,
  },
  swipeHint: { color: C.muted, fontSize: 12, marginTop: 7, marginBottom: 19 },
  deck: { height: Platform.OS === "web" ? 294 : 390, position: "relative" },
  nextDeckCard: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 12,
    bottom: 0,
    borderRadius: 25,
    overflow: "hidden",
    opacity: 0.42,
  },
  deckCard: {
    position: "absolute",
    inset: 0,
    borderRadius: 25,
    overflow: "hidden",
    backgroundColor: C.surface,
  },
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
  deckInfo: { position: "absolute", left: 18, right: 18, bottom: 18 },
  deckTitle: {
    color: "#FFF",
    fontSize: 29,
    lineHeight: 31,
    fontWeight: "900",
    letterSpacing: -1,
  },
  deckMeta: { color: "#D2D8D4", fontSize: 12, marginTop: 4 },
  deckNote: { color: "#B9C2BD", fontSize: 11, lineHeight: 15, marginTop: 10 },
  swipeActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 22,
    alignItems: "center",
    marginTop: 22,
  },
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
  keepAction: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.gold,
    alignItems: "center",
    justifyContent: "center",
  },
});
