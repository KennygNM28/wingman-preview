# Wingman v9 — Replit Test Plan

After uploading/importing this ZIP in Replit:

1. Install dependencies and run the API + Wingman web workflows.
2. Confirm bottom nav reads: The Action / The Numbers / Wingman / The Word / The Huddle.
3. Open Profile and confirm MLB shows 30 teams, NFL 32, NBA 30. Search Alabama/Duke in the college team directories.
4. The Action: test a current MLB date and verify game cards; tap a game to open Game Center.
5. Ask Your Wingman probes:
   - MLB: `What is Zack Wheeler's ERA this season?`
   - NFL: `How many points per game are the Eagles scoring?`
   - NBA: `How many points is Jayson Tatum averaging in his last 10 games?`
   - NCAAF: `How many points per game is Alabama scoring?`
   - NCAAB: `How many points per game is Duke scoring?`
6. The Numbers: test PHI MLB, PHI NFL, BOS NBA, ALA NCAAF, DUKE NCAAB. Confirm request stays alive even when archived odds samples are sparse.
7. If SportsDataIO credentials are configured, verify Bets % / Money % appear under each current spread/ML/total outcome and heat badges follow 10/20/30-point thresholds.
8. Confirm The Word and The Huddle are separate tabs and Profile is no longer in bottom navigation.
