import { sampleGames } from "@52archive/core";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  const game = sampleGames[0];

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>52Archive</Text>
      <Text style={styles.body}>Browse deck-only card games and author branched rule graphs on the go.</Text>
      <View style={styles.card}>
        <Text style={styles.kicker}>Featured</Text>
        <Text style={styles.cardTitle}>{game.title}</Text>
        <Text style={styles.cardBody}>{game.subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f1e7",
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 42,
    lineHeight: 44,
    marginBottom: 12,
    color: "#231b15",
    fontFamily: "Georgia",
  },
  body: {
    color: "#7e6d5b",
    maxWidth: 420,
  },
  card: {
    marginTop: 24,
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#fffaf2",
    borderWidth: 1,
    borderColor: "rgba(35, 27, 21, 0.10)",
  },
  kicker: {
    color: "#b17a4b",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  cardTitle: {
    marginTop: 8,
    color: "#231b15",
    fontSize: 24,
    fontFamily: "Georgia",
  },
  cardBody: {
    color: "#7e6d5b",
    marginTop: 8,
  },
});
