# Hearthstone Battlegrounds — `Power.log` Reference

> Derived from live log analysis: `/Applications/Hearthstone/Logs/Hearthstone_2026_04_04_15_42_20/Power.log`
> 712,563 lines · 3 complete BG game sessions
> Build number: **238087**

This document is the canonical reference for the `Power.log` format as it applies to Battlegrounds. It is intended for both humans and AI working on hs-card-reference's watcher/parser pipeline.

---

## Table of Contents

1. [File Structure Overview](#1-file-structure-overview)
2. [Line Format](#2-line-format)
3. [Log Subsystems](#3-log-subsystems)
4. [Top-Level Record Types](#4-top-level-record-types)
5. [BLOCK_START Subtypes](#5-block_start-subtypes)
6. [Entity References](#6-entity-references)
7. [Zone System](#7-zone-system)
8. [The Tag/Value System](#8-the-tagvalue-system)
9. [BG-Specific Tags](#9-bg-specific-tags)
10. [Game Lifecycle: Phase by Phase](#10-game-lifecycle-phase-by-phase)
11. [Combat Narration](#11-combat-narration)
12. [Shop Mechanics in the Log](#12-shop-mechanics-in-the-log)
13. [Player Identification](#13-player-identification)
14. [What Is NOT Available](#14-what-is-not-available)
15. [Multiple Games in One File](#15-multiple-games-in-one-file)
16. [What the Watcher Currently Extracts](#16-what-the-watcher-currently-extracts)
17. [Potential Features This Data Could Enable](#17-potential-features-this-data-could-enable)

---

## 1. File Structure Overview

A single `Power.log` file typically spans the entire Hearthstone session and may contain **multiple game records** separated by `CREATE_GAME` markers. In the sample file, three complete BG games are present (lines 2, 240596, 459994).

The log is append-only and grows while HS is running. The watcher tails it live and replays from the last `CREATE_GAME` on startup.

Every line is prefixed with a date code and source tag:

```
D HH:MM:SS.SSSSSSS  SourceSubsystem() - Content
```

---

## 2. Line Format

```
D 15:43:06.8625010 GameState.DebugPrintPower() - TAG_CHANGE Entity=13 tag=STATE value=RUNNING
^  ^               ^                             ^
|  Timestamp       Subsystem                     Content
"D" (Debug)
```

- **`D`** — always `D` (Debug). Informational lines use `I`, warnings `W`, errors `E`, but the game-state data is always `D`.
- **Timestamp** — `HH:MM:SS.SSSSSSS` (7-digit subsecond). No date — this is a within-session clock. A new HS session resets it.
- **Subsystem** — see §3 below.
- **Content** — the record body. Indentation within content is significant (nested block tags).

---

## 3. Log Subsystems

| Subsystem | Purpose | Parse? |
|---|---|---|
| `GameState.DebugPrintPower()` | **Primary stream.** Authoritative real-time game state changes. Parse this. | ✅ |
| `GameState.DebugPrintPowerList()` | Batch replay of the current PowerTaskList as a checkpoint. Duplicates the same events. | ⚠️ Skip to avoid double-counting |
| `PowerTaskList.DebugPrintPower()` | Task-list execution trace — same events again, slightly later. Another duplicate. | ⚠️ Skip |
| `PowerTaskList.DebugDump()` | Internal task-list metadata. | ❌ Ignore |
| `GameState.DebugPrintGame()` | Game metadata emitted once per `CREATE_GAME`: build number, game type, player names. | ✅ Parse once |
| `GameState.DebugPrintEntityChoices()` | Hero selection and discover/triple choice menus. | ✅ Optional |
| `GameState.SendChoices()` | The player's actual selection from a choice menu. | ✅ Optional |
| `GameState.DebugPrintOptions()` | Available actions for the current player each turn. | ✅ Optional |
| `PowerProcessor.*` | Internal bookkeeping. | ❌ Ignore |

**Key rule:** The existing watcher only parses `GameState.DebugPrintPower()` lines (regex: `/GameState\.DebugPrintPower\(\) - (.+)$/`). This is correct — it is the authoritative, non-duplicated stream.

---

## 4. Top-Level Record Types

### `CREATE_GAME`

Signals a new game session. Immediately followed by a `GameEntity` block and `Player` blocks.

```
GameState.DebugPrintPower() - CREATE_GAME
GameState.DebugPrintPower() -     GameEntity EntityID=13
GameState.DebugPrintPower() -         tag=CARDTYPE value=GAME
GameState.DebugPrintPower() -         tag=COIN_MANA_GEM value=1          ← BG mode flag
GameState.DebugPrintPower() -         tag=BACON_GLOBAL_ANOMALY_DBID value=102046
GameState.DebugPrintPower() -         tag=GAME_SEED value=1379574629
...
GameState.DebugPrintPower() -     Player EntityID=14 PlayerID=5 GameAccountId=[hi=... lo=...]
GameState.DebugPrintPower() -         tag=HERO_ENTITY value=33            ← points to hero entity ID
GameState.DebugPrintPower() -         tag=PLAYER_TECH_LEVEL value=1
GameState.DebugPrintPower() -         tag=NEXT_OPPONENT_PLAYER_ID value=6
```

This is followed by `DebugPrintGame` (outside the power stream) with build number and player names:

```
GameState.DebugPrintGame() - BuildNumber=238087
GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS
GameState.DebugPrintGame() - FormatType=FT_WILD
GameState.DebugPrintGame() - ScenarioID=3459
GameState.DebugPrintGame() - PlayerID=5, PlayerName=wardac#1504
GameState.DebugPrintGame() - PlayerID=13, PlayerName=ShinyHero
```

> **Note:** `PlayerID=13 PlayerName=ShinyHero` is the Bartender Bob AI proxy, not a real player. The real players are in SETASIDE as separate hero entities (see §13).

### `FULL_ENTITY - Creating`

Creates a new entity and sets its initial tags. Appears at game start (all entities in the starting pool) and throughout the game as new entities are summoned, revealed, or generated.

```
GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=868 CardID=BG34_630
GameState.DebugPrintPower() -     tag=CONTROLLER value=5
GameState.DebugPrintPower() -     tag=CARDTYPE value=MINION
GameState.DebugPrintPower() -     tag=ATK value=1
GameState.DebugPrintPower() -     tag=HEALTH value=1
GameState.DebugPrintPower() -     tag=ZONE value=SETASIDE
GameState.DebugPrintPower() -     tag=ENTITY_ID value=868
GameState.DebugPrintPower() -     tag=CARDRACE value=DRAGON
GameState.DebugPrintPower() -     tag=DEATHRATTLE value=1
GameState.DebugPrintPower() -     tag=IS_BACON_POOL_MINION value=1
GameState.DebugPrintPower() -     tag=BACON_SUBSET_DRAGON value=1
GameState.DebugPrintPower() -     tag=BACON_TRIPLE_UPGRADE_MINION_ID value=126742
GameState.DebugPrintPower() -     tag=TECH_LEVEL value=1
```

A `FULL_ENTITY` with `CardID=` (empty) is an unknown/hidden entity — its card identity will be revealed by a subsequent `SHOW_ENTITY`.

### `FULL_ENTITY - Updating`

`PowerTaskList.DebugPrintPower()` uses "Updating" instead of "Creating" for the replay stream. These are duplicates of earlier FULL_ENTITY - Creating lines. The primary stream (`GameState.DebugPrintPower`) always uses "Creating".

### `SHOW_ENTITY`

Reveals a previously hidden entity (one created with empty `CardID=`). Sets the `CardID` and initial tags simultaneously.

```
GameState.DebugPrintPower() - SHOW_ENTITY - Updating Entity=702 CardID=BG24_HERO_204pe4
GameState.DebugPrintPower() -     tag=CONTROLLER value=5
GameState.DebugPrintPower() -     tag=CARDTYPE value=ENCHANTMENT
GameState.DebugPrintPower() -     tag=ATTACHED value=701
```

### `HIDE_ENTITY`

Hides an entity (sends it back to unknown state). Rarely seen in BG; occurs when enchantments expire or zones change.

```
GameState.DebugPrintPower() -     HIDE_ENTITY - Entity=[entityName=3ofKindCheckPlayerEnchant id=60 ...] tag=ZONE value=GRAVEYARD
```

### `TAG_CHANGE`

The most common record. Updates a single tag on an existing entity.

```
GameState.DebugPrintPower() - TAG_CHANGE Entity=wardac#1504 tag=RESOURCES value=4
GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Bubble Gunner id=290 zone=PLAY zonePos=1 cardId=BG31_149 player=5] tag=DAMAGE value=2
```

Entity can be referenced by bare ID (`Entity=13`), by player name (`Entity=wardac#1504`), or by the full bracket form (`Entity=[entityName=... id=N ...]`). See §6.

### `META_DATA`

Annotation records embedded inside BLOCK content. Not state changes — they are hints to the game client for animation/timing.

```
GameState.DebugPrintPower() -     META_DATA - Meta=DAMAGE Data=2 InfoCount=1
GameState.DebugPrintPower() -                 Info[0] = [entityName=Bubble Gunner id=630 ...]
GameState.DebugPrintPower() -     META_DATA - Meta=SLUSH_TIME Data=1140 InfoCount=1
GameState.DebugPrintPower() -     META_DATA - Meta=ARTIFICIAL_PAUSE Data=1500 InfoCount=1
GameState.DebugPrintPower() -     META_DATA - Meta=HISTORY_TARGET Data=0 InfoCount=1
GameState.DebugPrintPower() -     META_DATA - Meta=POISONOUS Data=0 InfoCount=1
GameState.DebugPrintPower() -     META_DATA - Meta=TARGET Data=0 InfoCount=1
GameState.DebugPrintPower() -     META_DATA - Meta=CONTROLLER_AND_ZONE_CHANGE Data=0 InfoCount=5
```

| Meta type | Meaning |
|---|---|
| `DAMAGE` | How much damage was dealt; `Info[0]` is the target |
| `SLUSH_TIME` | Animation timing hint (milliseconds) |
| `ARTIFICIAL_PAUSE` | Forced pause before next animation |
| `HISTORY_TARGET` | History tile target hint |
| `POISONOUS` | Poisonous/Venomous trigger visual |
| `TARGET` | Target of a triggered effect |
| `ARTIFICIAL_HISTORY_INTERRUPT` | Used at recruit→combat transition |

### `BLOCK_START` / `BLOCK_END`

Wraps a logical action. See §5.

### `SUB_SPELL_START` / `SUB_SPELL_END`

Wraps a visual spell effect. Contains no state-change data; can be ignored by parsers.

```
GameState.DebugPrintPower() -     SUB_SPELL_START - SpellPrefabGUID=Bacon_MinionSwap_OverrideSpawnIn_Super:... Source=59 TargetCount=0
```

---

## 5. BLOCK_START Subtypes

```
BLOCK_START BlockType=TYPE Entity=REF EffectCardId=... EffectIndex=N Target=N SubOption=N [TriggerKeyword=K]
```

| BlockType | When | Key signal |
|---|---|---|
| `TRIGGER` | Any triggered effect fires | Usually just wraps TAG_CHANGE(s) |
| `ATTACK` | A minion attacks (combat phase) | See §11 |
| `POWER` | A spell or activated ability resolves | Hero powers, shop spells |
| `DEATHS` | Death processing after an attack | Contains zone→GRAVEYARD, REBORN spawns |

The `TriggerKeyword` field on TRIGGER blocks names the keyword that triggered (e.g. `VENOMOUS`, `DIVINE_SHIELD`, `TRIGGER_VISUAL`, `TAG_NOT_SET`).

`EffectCardId` is often `System.Collections.Generic.List\`1[System.String]` — a C# serialization artifact. Not useful.

Blocks nest: an ATTACK block contains TRIGGER sub-blocks (deathrattle, battlecry, etc.) and then a DEATHS block.

---

## 6. Entity References

Three forms appear in `TAG_CHANGE Entity=...` and `BLOCK_START Entity=...`:

| Form | Example | Notes |
|---|---|---|
| Bare ID | `Entity=13` | Numeric entity ID. Ambiguous without a lookup table. |
| Player name | `Entity=wardac#1504` | Only for Player entities. The local player's BattleTag. |
| Bracket | `Entity=[entityName=Bubble Gunner id=290 zone=PLAY zonePos=1 cardId=BG31_149 player=5]` | Full rich form. Contains ID, current zone, card ID, and controller. |

The bracket form is a snapshot of the entity's state **at the time the line was written** — the `zone` inside the brackets may lag behind the actual zone change in the content. Always prefer the `TAG_CHANGE tag=ZONE value=...` for canonical zone updates.

To extract numeric entity ID from the bracket form: `/\bid=(\d+)\b/`
To extract cardId: `/\bcardId=(\S+?)\s/` (note trailing space — cardId is not last in the bracket)

---

## 7. Zone System

| Zone | Meaning in BG |
|---|---|
| `PLAY` | Active on the board or in the game world (hero in play, minion on board, Bob's tavern minions) |
| `HAND` | Player's hand — in BG, used for hero offers during mulligan and for bought minions before placement |
| `SETASIDE` | Out of active play but still tracked (pool minions, opposing heroes, enchantments, dead entities waiting for reborn) |
| `GRAVEYARD` | Permanently destroyed/consumed this combat; resources reset to SETASIDE next turn |

**Bob's tavern minions** appear in `ZONE=PLAY` with `CONTROLLER=13` (Bartender Bob's player ID). When a player buys one, its `ZONE` changes from `PLAY` (controller=13) to `HAND` (controller=local player), then to `PLAY` (controller=local player) when placed on their board.

**ZONE_POSITION** is the 1-indexed slot number within a zone. Position 0 means unpositioned/setaside.

---

## 8. The Tag/Value System

Tags identify game properties. Some have symbolic names; others appear as raw integers (unknown or internal tags).

### Common universal tags

| Tag | Type | Notes |
|---|---|---|
| `ENTITY_ID` | int | Unique per entity per game session |
| `CARDTYPE` | enum | `GAME`, `PLAYER`, `HERO`, `MINION`, `SPELL`, `ENCHANTMENT` |
| `CONTROLLER` | int | PlayerID of the controlling player |
| `ZONE` | enum | See §7 |
| `ZONE_POSITION` | int | Slot within zone (1-indexed) |
| `ATK` | int | Current attack value |
| `HEALTH` | int | Current max health (tracks buffs; compare `DAMAGE` for current HP) |
| `DAMAGE` | int | Damage taken this turn; current HP = HEALTH − DAMAGE |
| `ARMOR` | int | Hero armor points |
| `COST` | int | Mana/gold cost |
| `CARDRACE` | enum | Race enum value (14=MURLOC, 15=DEMON, 17=MECH, 18=ELEMENTAL, 20=BEAST, 23=PIRATE, 24=DRAGON, 43=QUILBOAR, 92=NAGA, 11=UNDEAD) |
| `DIVINE_SHIELD` | bool | 1=has divine shield |
| `DIVINE_SHIELD_DAMAGE` | bool | 1=divine shield was just popped this combat |
| `REBORN` | bool | 1=has reborn |
| `POISONOUS` | bool | 1=poisonous (legacy tag, pre-Venomous) |
| `VENOMOUS` | bool | 1=venomous |
| `WINDFURY` | bool | 1=windfury |
| `TAUNT` | bool | 1=taunt |
| `DEATHRATTLE` | bool | 1=has deathrattle |
| `BATTLECRY` | bool | 1=has battlecry |
| `STEALTH` | bool | 1=stealth |
| `EXHAUSTED` | bool | 1=cannot attack this turn |
| `ATTACKING` | bool | 1=currently the attacker in an in-progress attack |
| `DEFENDING` | bool | 1=currently the defender |
| `TO_BE_DESTROYED` | bool | 1=poisonous/venomous kill pending |
| `PREMIUM` | bool | 1=golden (triple or golden from pool) |
| `PLAYSTATE` | enum | `PLAYING`, `WON`, `LOST`, `CONCEDED` |
| `STATE` | enum | `RUNNING` (game active), `COMPLETE` (game ended) |
| `STEP` / `NEXT_STEP` | enum | Game phase. See §10. |
| `NUM_TURNS_IN_PLAY` | int | Turn counter for game/entities |
| `LAST_AFFECTED_BY` | int | EntityID of last thing that touched this entity |

### Unnamed/numeric tags

Many tags appear as raw integers: `tag=1483 value=2`, `tag=3026 value=1`, etc. The watcher treats tag `3026` as a hero-playing signal; tag `1483` appears to be a running "buddy meter" counter (increments per combat event). Most numeric tags are internal and safe to ignore.

---

## 9. BG-Specific Tags

These tags appear exclusively (or primarily) in Battlegrounds games.

| Tag | Entity | Meaning |
|---|---|---|
| `COIN_MANA_GEM` | GameEntity | `value=1` → this is a BG game (primary mode detection signal) |
| `BACON_GLOBAL_ANOMALY_DBID` | GameEntity | DBF ID of the active anomaly (0 = no anomaly) |
| `BACON_ALT_TAVERN_SYSTEM_ACTIVE` | GameEntity | Signals the "Alt Tavern" system is on |
| `BACON_MULLIGAN_HERO_REROLL_ACTIVE` | GameEntity | Hero reroll mechanic is active this session |
| `BACON_COMBAT_DAMAGE_CAP` | GameEntity | Max combat damage per round (increases as game progresses) |
| `BACON_TURNS_UNTIL_ALT_TAVERN` | GameEntity | Countdown to Timewarped event |
| `BACON_CHOSEN_BOARD_SKIN_ID` | GameEntity | Board skin used |
| `PLAYER_LEADERBOARD_PLACE` | Hero entity | Current ranking of this player (1–8); updates after each combat |
| `PLAYER_TECH_LEVEL` | Hero/Player entity | Current tavern tier (1–6) |
| `BACON_MAX_PLAYER_TECH_LEVEL` | Hero/Player entity | Max tier allowed (normally 6) |
| `NEXT_OPPONENT_PLAYER_ID` | Player/Hero entity | PlayerID of the next opponent |
| `BACON_CURRENT_COMBAT_PLAYER_ID` | Player entity | PlayerID of the player whose combat is being watched. Non-zero during combat phase, 0 between. |
| `BACON_COMBAT_PHASE_HERO` | Hero entity | `value=1` on both hero copies at combat start — marks which heroes are fighting |
| `IS_BACON_POOL_MINION` | Minion entity | `value=1` → this entity is from the tribal pool |
| `BACON_SUBSET_<TRIBE>` | Pool minion | `value=1` → this minion belongs to `<TRIBE>` pool. Tribes: BEAST, DEMON, DRAGON, ELEMENTALS, MECH, MURLOC, NAGA, PIRATE, QUILLBOAR, UNDEAD. A dual-tribe minion has two BACON_SUBSET tags. |
| `BACON_TRIPLE_UPGRADE_MINION_ID` | Pool minion | DBF ID of the golden upgrade for this minion |
| `BACON_TIMEWARPED` | Minion entity | `value=1` → this is a Timewarped minion |
| `BACON_HERO_CAN_BE_DRAFTED` | Hero entity | `value=1` → this hero is being offered to a player during mulligan |
| `BACON_LOCKED_MULLIGAN_HERO` | Hero entity | `value=1` → this hero is the "locked" default that the player will get if they don't pick another |
| `BACON_DIED_LAST_COMBAT` | Pool minion (in SETASIDE) | `value=1` → this minion died during the most recent combat |
| `BACON_COMBAT_DAMAGE_CAP_ENABLED` | GameEntity | `value=1` → damage cap is active |
| `BACON_IS_KEL_THUZAD` | Hero entity (ID=57) | Marks the special Kel'Thuzad entity |
| `BACON_DUMMY_PLAYER` | Player entity | `value=1` → this is the Bartender Bob AI controller, not a real player |
| `BACON_HERO_POWER_ACTIVATED` | Hero power entity | `value=1` → hero power was used this turn |
| `BACON_QUEST_COMPLETED` | Hero entity | Quest reward unlocked |
| `BACON_HERO_HEROPOWER_QUEST_REWARD_COMPLETED` | Hero entity | Hero power quest reward specifically completed |
| `RESOURCES` | Player entity | Gold available at start of this turn |
| `RESOURCES_USED` | Player entity | Gold spent so far this turn |
| `NUM_RESOURCES_SPENT_THIS_GAME` | Player entity | Total gold spent across all turns |
| `DAMAGE_DEALT_TO_HERO_LAST_TURN` | Player entity | Damage received in the most recent combat |
| `CORPSES` | Player entity | Number of friendly minions that have died this game (Undead mechanic) |
| `NUM_FRIENDLY_MINIONS_THAT_DIED_THIS_TURN` | Player entity | Combat counter |
| `NUM_FRIENDLY_MINIONS_THAT_DIED_THIS_GAME` | Player entity | Running total |
| `NUM_MINIONS_PLAYER_KILLED_THIS_TURN` | Player entity | Minions this player killed this combat |

---

## 10. Game Lifecycle: Phase by Phase

### Phase transitions via `NEXT_STEP` / `STEP`

The game engine uses `TAG_CHANGE Entity=GameEntity tag=NEXT_STEP value=X` to advance the state machine, followed by `tag=STEP value=X` to confirm the transition.

Full sequence per game:

```
CREATE_GAME
  → NEXT_STEP=BEGIN_MULLIGAN     (hero selection screen)
  → STEP=BEGIN_MULLIGAN

  [hero offers appear via FULL_ENTITY blocks in ZONE=HAND]
  [player picks via SendChoices id=1 ChoiceType=MULLIGAN]
  [unchosen heroes → ZONE=GRAVEYARD]
  [chosen hero → PLAYER_LEADERBOARD_PLACE set → signals which hero is playing]

  → NEXT_STEP=MAIN_READY         (mulligan done, game starting)
  → STEP=MAIN_READY

  [Per turn, the recruit phase cycles through:]
  → NEXT_STEP=MAIN_START_TRIGGERS
  → NEXT_STEP=MAIN_START          ← tavern shop available; RESOURCES updated
  → NEXT_STEP=MAIN_ACTION         ← player can take actions (IN_GAME phase)
  → NEXT_STEP=MAIN_END            ← player ends turn / timer expires
  → NEXT_STEP=MAIN_CLEANUP
  → NEXT_STEP=MAIN_NEXT

  [NEXT_STEP=MAIN_READY begins the next turn]

  [At turn end, combat fires: BLOCK_START BlockType=ATTACK ...]
  [BACON_CURRENT_COMBAT_PLAYER_ID goes non-zero → combat in progress]

  → NEXT_STEP=FINAL_WRAPUP       ← last player eliminated
  → STEP=FINAL_WRAPUP
  → NEXT_STEP=FINAL_GAMEOVER
  → STEP=FINAL_GAMEOVER
  → TAG_CHANGE Entity=GameEntity tag=STATE value=COMPLETE
  → TAG_CHANGE Entity=wardac#1504 tag=PLAYSTATE value=LOST  (or WON)
```

### Detecting BG mode

`COIN_MANA_GEM value=1` on the GameEntity, inside the `CREATE_GAME` block. This is the first reliable signal.

### Detecting the active hero

After the mulligan resolves, the chosen hero entity gets:
```
TAG_CHANGE Entity=[...hero...] tag=PLAYER_LEADERBOARD_PLACE value=1
```
and transitions from `ZONE=HAND` to `ZONE=PLAY`.

A more universal signal (works even for heroes with no tribe bonus) is `tag=PLAYER_LEADERBOARD_PLACE` inside a `FULL_ENTITY` block for a BG hero card ID.

### Turn number

`TAG_CHANGE Entity=GameEntity tag=NUM_TURNS_IN_PLAY value=N` increments once per full recruit+combat cycle.

### Recruit phase start (gold grant)

At `NEXT_STEP=MAIN_START`:
```
TAG_CHANGE Entity=wardac#1504 tag=RESOURCES value=4
```
This is the gold available for the turn.

---

## 11. Combat Narration

Combat is fully narrated in `GameState.DebugPrintPower()`. Each combat is paired to two players via `BACON_CURRENT_COMBAT_PLAYER_ID`.

### Combat setup

```
TAG_CHANGE Entity=wardac#1504 tag=BACON_CURRENT_COMBAT_PLAYER_ID value=5
TAG_CHANGE Entity=Bartender Bob tag=BACON_CURRENT_COMBAT_PLAYER_ID value=6
TAG_CHANGE Entity=<hero_copy_id> tag=BACON_COMBAT_PHASE_HERO value=1
```

Two hero entity copies are created for each combat: one for each participating player. These are SETASIDE entities. The `BACON_COMBAT_PHASE_HERO` tag marks which hero copies are active for this combat.

Combat ends when:
```
TAG_CHANGE Entity=wardac#1504 tag=BACON_CURRENT_COMBAT_PLAYER_ID value=0
```

### Attack block

```
BLOCK_START BlockType=ATTACK Entity=[entityName=Bubble Gunner id=290 ...] EffectCardId=... EffectIndex=0 Target=0 SubOption=-1
    TAG_CHANGE Entity=wardac#1504 tag=NUM_FRIENDLY_MINIONS_THAT_ATTACKED_THIS_TURN value=1
    TAG_CHANGE Entity=GameEntity tag=PROPOSED_ATTACKER value=290
    TAG_CHANGE Entity=GameEntity tag=PROPOSED_DEFENDER value=630
    TAG_CHANGE Entity=[...id=290...] tag=ATTACKING value=1
    META_DATA - Meta=SLUSH_TIME Data=1140 InfoCount=1
    TAG_CHANGE Entity=[...id=630...] tag=DEFENDING value=1
    TAG_CHANGE Entity=[...id=290...] tag=NUM_ATTACKS_THIS_TURN value=1
    TAG_CHANGE Entity=[...id=630...] tag=PREDAMAGE value=2     ← damage about to land
    TAG_CHANGE Entity=[...id=630...] tag=PREDAMAGE value=0     ← reset
    META_DATA - Meta=DAMAGE Data=2 InfoCount=1                ← confirmed damage amount
    TAG_CHANGE Entity=[...id=630...] tag=DAMAGE value=2        ← actual accumulated damage
    [if divine shield popped:]
    TAG_CHANGE Entity=[...id=290...] tag=DIVINE_SHIELD value=0
    [if venomous trigger:]
    BLOCK_START BlockType=TRIGGER ... TriggerKeyword=VENOMOUS
        TAG_CHANGE Entity=[...id=290...] tag=TO_BE_DESTROYED value=1
    BLOCK_END
    TAG_CHANGE Entity=GameEntity tag=PROPOSED_ATTACKER value=0
    TAG_CHANGE Entity=GameEntity tag=PROPOSED_DEFENDER value=0
    TAG_CHANGE Entity=[...id=290...] tag=ATTACKING value=0
    TAG_CHANGE Entity=[...id=630...] tag=DEFENDING value=0
BLOCK_END
```

### Death block

Follows immediately after the attack that caused a death:

```
BLOCK_START BlockType=DEATHS Entity=GameEntity ...
    [deathrattle / reborn triggers fire here as BLOCK_START BlockType=TRIGGER]
    [REBORN: a new FULL_ENTITY Creating is emitted with the same CardID and fresh tags]
    TAG_CHANGE Entity=[...dying minion...] tag=ZONE value=GRAVEYARD
    TAG_CHANGE Entity=wardac#1504 tag=NUM_FRIENDLY_MINIONS_THAT_DIED_THIS_TURN value=1
    TAG_CHANGE Entity=[...dying minion...] tag=BACON_DIED_LAST_COMBAT value=1  [on pool copy]
    TAG_CHANGE Entity=wardac#1504 tag=CORPSES value=N
BLOCK_END
```

### Hero damage

After all minions on one side die, the losing hero takes damage. The attack lands on the **hero entity** directly:

```
TAG_CHANGE Entity=[entityName=Clockwork Mechano id=101 ...] tag=PREDAMAGE value=4
TAG_CHANGE Entity=wardac#1504 tag=DAMAGE_DEALT_TO_HERO_LAST_TURN value=4
```

Hero current HP = `HEALTH` (30 for most heroes) + `ARMOR` − `DAMAGE`.

Armor changes as heroes take damage:
```
TAG_CHANGE Entity=[entityName=Thorim, Stormlord id=158 ...] tag=ARMOR value=16
```

### Reborn mechanic

Inside the DEATHS block, the `BaconShop8PlayerEnchant` trigger (EffectIndex=37) creates a new `FULL_ENTITY` with the same CardID as the dying minion, and `DIVINE_SHIELD value=0`, `HEALTH value=1`. It spawns in `ZONE=SETASIDE` and then transitions to `ZONE=PLAY`.

### Windfury / double-attack

A minion with Windfury has two separate `BLOCK_START BlockType=ATTACK` blocks in sequence. The second attack sets `EXHAUSTED value=1` after firing.

---

## 12. Shop Mechanics in the Log

### Shop UI entities

The following entities are created at game start and persist throughout:

| CardID | Name | Purpose |
|---|---|---|
| `TB_BaconShop_8P_PlayerE` | BaconShop8PlayerEnchant | Master game controller enchantment; fires many triggers |
| `TB_BaconShop_8p_Reroll_Button` | Refresh | Reroll button |
| `TB_BaconShopLockAll_Button` | Freeze | Freeze/lock button |
| `TB_BaconShop_DragSell` | Drag To Sell | Sell minion button |
| `TB_BaconShopTechUp02_Button` | Tavern Tier 2 | Tier upgrade button (cost shown in COST tag) |
| `TB_BaconShop_DragBuy_Spell` | Drag To Buy Spell | Spell purchase drag |
| `TB_BaconShop_CheckTriples` | Check Triples | Triple detection checker |
| `TB_BaconShop_UpdateDmgCap` | Update Damage Cap | Updates BACON_COMBAT_DAMAGE_CAP each turn |

### Gold (resources)

```
TAG_CHANGE Entity=wardac#1504 tag=RESOURCES value=4         ← gold this turn
TAG_CHANGE Entity=wardac#1504 tag=RESOURCES_USED value=3    ← gold spent
TAG_CHANGE Entity=wardac#1504 tag=NUM_RESOURCES_SPENT_THIS_GAME value=10
```

Note: `RESOURCES` is set once at `NEXT_STEP=MAIN_START` and represents the total gold for the turn. `RESOURCES_USED` increments as the player spends. There is no explicit "gold remaining" tag — it is implicit: `RESOURCES - RESOURCES_USED`.

Gold resets to 0 at combat phase: `TAG_CHANGE Entity=wardac#1504 tag=RESOURCES_USED value=0`

### Buying a minion

A buy is signalled by:
```
TAG_CHANGE Entity=wardac#1504 tag=RESOURCES_USED value=3    ← gold spent
TAG_CHANGE Entity=[minion in Bob's tavern] tag=ZONE value=HAND  ← into player's hand
```

Then placement:
```
TAG_CHANGE Entity=[minion] tag=ZONE value=PLAY
TAG_CHANGE Entity=[minion] tag=ZONE_POSITION value=2
TAG_CHANGE Entity=[minion] tag=CONTROLLER value=5
```

### Freezing (locking) the shop

No dedicated `BACON_FROZEN` tag is visible in the `GameState.DebugPrintPower()` stream directly. The freeze state is tracked internally by the `TB_BaconShopLockAll_Button` entity's activation. The shop minions simply don't change zone at turn end when frozen.

### Tier upgrade

The Tier Up button has a `COST` tag that decrements each turn (starts at 5, goes to 4, 3…):
```
TAG_CHANGE Entity=[Tavern Tier 2 id=758 ...] tag=COST value=4
```

When upgraded:
```
TAG_CHANGE Entity=[hero] tag=PLAYER_TECH_LEVEL value=2
```

The `DebugPrintOptions` stream shows the Tier Up button with `error=REQ_ENOUGH_MANA` when the player can't afford it — useful for knowing whether it was available.

### Triple reward discovery

When a triple is completed, a `TB_BaconShop_Triples_01` entity is placed in PLAY. The discovery is announced via `DebugPrintEntityChoices`:

```
GameState.DebugPrintEntityChoices() - id=2 Player=wardac#1504 TaskList= ChoiceType=GENERAL CountMin=1 CountMax=1
GameState.DebugPrintEntityChoices() -   Source=[entityName=Triple Reward id=949 zone=PLAY zonePos=0 cardId=TB_BaconShop_Triples_01 player=5]
GameState.DebugPrintEntityChoices() -   Entities[0]=[entityName=Tad id=962 zone=SETASIDE zonePos=0 cardId=BG22_202 player=5]
GameState.DebugPrintEntityChoices() -   Entities[1]=[entityName=Oozeling Gladiator id=964 zone=SETASIDE zonePos=0 cardId=BG27_002 player=5]
GameState.DebugPrintEntityChoices() -   Entities[2]=[entityName=Irate Rooster id=960 zone=SETASIDE zonePos=0 cardId=BG29_990 player=5]
```

The player's choice:
```
GameState.SendChoices() - id=2 ChoiceType=GENERAL
GameState.SendChoices() -   m_chosenEntities[0]=[entityName=Tad id=962 zone=SETASIDE ... cardId=BG22_202 ...]
```

The chosen entity's zone then transitions: `SETASIDE → HAND → PLAY`.

### Spells and spell shop

Spells appear in the tavern as `ZONE=PLAY CONTROLLER=13` entities with `CARDTYPE=SPELL`. The buy flow is the same as minions. Spell card IDs follow the `EBG_Spell_*` and `BG_Spell_*` naming convention.

---

## 13. Player Identification

### Local player

In `DebugPrintGame()`:
```
PlayerID=5, PlayerName=wardac#1504
```

The local player's BattleTag is known from game start. PlayerID (5 in this session) is used in `CONTROLLER` tags to identify which entities belong to the local player.

### "ShinyHero" (PlayerID=13)

This is **not a real player**. It is the Bartender Bob AI proxy that controls:
- Bob's tavern (CardID=`TB_BaconShopBob`)
- The opponent's board during combat (Bartender Bob copies enemy boards)

Its player name varies; in this log it appears as "ShinyHero" but in other sessions it may differ.

### The 8 real players

All 8 player heroes are revealed during `BEGIN_MULLIGAN` as `FULL_ENTITY` blocks in `ZONE=SETASIDE`, `CONTROLLER=13` (Bob's controller). Example:

```
FULL_ENTITY - Creating ID=158 CardID=BG27_HERO_801    ← Thorim, Stormlord
    tag=CONTROLLER value=13
    tag=ZONE value=SETASIDE
    tag=PLAYER_LEADERBOARD_PLACE value=2
```

Their BattleTag names appear only via `TAG_CHANGE Entity=<name> tag=...` lines once they become combat opponents. Player names seen in this log: `wardac#1504`, `RODIMUSPRIME`, `Lain`, `Feyr`, `GrandpaBi`, `Zmiley`.

### Matching opponent names to heroes

The pattern is: when a player named X becomes your opponent, their hero entity gets:
```
TAG_CHANGE Entity=wardac#1504 tag=BACON_CURRENT_COMBAT_PLAYER_ID value=5
TAG_CHANGE Entity=<opponentname> tag=BACON_CURRENT_COMBAT_PLAYER_ID value=N
```
where N is that player's PlayerID. Their hero entity (CONTROLLER=13) has the same PlayerID in its initial `Player EntityID=... PlayerID=N` record.

### Leaderboard tracking

`PLAYER_LEADERBOARD_PLACE` on hero entities is broadcast for all 8 heroes and updates continuously — it's the most reliable source of lobby standings:

```
TAG_CHANGE Entity=[entityName=Thorim, Stormlord id=158 ...] tag=PLAYER_LEADERBOARD_PLACE value=2
TAG_CHANGE Entity=[entityName=Tickatus id=128 ...] tag=PLAYER_LEADERBOARD_PLACE value=3
TAG_CHANGE Entity=[entityName=Queen Wagtoggle id=190 ...] tag=PLAYER_LEADERBOARD_PLACE value=4
```

### Player elimination

When a player is eliminated, their hero entity gets `PLAYSTATE=LOST` and is removed from the leaderboard (their position may be preserved or zeroed). The local player's death:
```
TAG_CHANGE Entity=wardac#1504 tag=PLAYSTATE value=LOST
TAG_CHANGE Entity=GrandpaBi tag=PLAYSTATE value=WON   ← who killed them
TAG_CHANGE Entity=GameEntity tag=NEXT_STEP value=FINAL_WRAPUP  [if last player standing]
```

---

## 14. What Is NOT Available

| Information | Why unavailable |
|---|---|
| Opponent hand contents | Hidden — opponent's hand is not broadcast |
| Other players' board during recruit phase | Only the local player's shop/board is streamed |
| Other players' gold or spending | `RESOURCES` only appears for the local player |
| Other players' hero power activations | Only observable when they are your combat opponent |
| Other players' shop contents | Not streamed |
| Exact opponent health before combat | ARMOR/HEALTH tags appear for all heroes, but they lag behind true values until a TAG_CHANGE fires |
| Freeze/lock state of opponent shops | Not broadcast |
| Buy/sell actions of other players | Not observable |
| Specific opponent pairing (who fights who) | `BACON_CURRENT_COMBAT_PLAYER_ID` only shows the local player's pairing |
| Results of other pairs' combats | Not shown |
| Exact damage formula | Base = hero_tech_level + surviving_minion_atk_sum; the log shows `DAMAGE_DEALT_TO_HERO_LAST_TURN` as the result |

---

## 15. Multiple Games in One File

A single `Power.log` contains all games played in a session without separation. The watcher handles this by resetting state on each `CREATE_GAME`. The parser should treat each `CREATE_GAME` as a full state reset.

Games in the sample file:
- Game 1: lines 2–240595 (15:43:06 – 16:02:10)
- Game 2: lines 240596–459993 (16:03:42 – 16:23:50)
- Game 3: lines 459994–712563 (16:28:46 – 16:50:03)

The `DebugPrintGame()` build number and player names are unique to each `CREATE_GAME` block. Always re-parse them on reset.

---

## 16. What the Watcher Currently Extracts

The current `logParser.ts` + `gameStateManager.ts` extracts:

| Field | Signal |
|---|---|
| BG mode confirmed | `COIN_MANA_GEM value=1` on GameEntity |
| Game start/reset | `CREATE_GAME` |
| Active hero(es) | `PLAYER_LEADERBOARD_PLACE` inside hero FULL_ENTITY, or `tag=3026` on hero in TAG_CHANGE |
| Anomaly | `BACON_GLOBAL_ANOMALY_DBID` |
| Timewarped minions | `BACON_TIMEWARPED value=1` |
| Active tribes | `IS_BACON_POOL_MINION` + `BACON_SUBSET_*` tags (constraint propagation) |
| Game phase | `NEXT_STEP=MAIN_ACTION` → IN_GAME; `NEXT_STEP=FINAL_GAMEOVER` → ENDED |

This is a focused minimal set sufficient for the card reference UI (filter by tribe, show anomaly, show timewarped).

---

## 17. Potential Features This Data Could Enable

### Immediately feasible (log data is available, just not parsed yet)

**Hero power tracker**
Parse `tag=BACON_HERO_POWER_ACTIVATED value=1` on hero power entities. Show whether the local player's hero power fired this turn. Useful for combo tracking (e.g. Galewing stacks).

**Gold efficiency readout**
`RESOURCES` and `RESOURCES_USED` are already in the stream. Track gold spent per turn, total gold spent this game, gold remaining. Could surface "turn N: you had X gold unspent".

**Current tier display**
`PLAYER_LEADERBOARD_PLACE` and `PLAYER_TECH_LEVEL` are broadcast. Show current tier and leaderboard position as an overlay.

**Opponent history**
`BACON_CURRENT_COMBAT_PLAYER_ID` + the opponent name from TAG_CHANGE reveal which opponent was faced each turn. Track which players you've fought.

**Combat outcome & damage tracking**
`DAMAGE_DEALT_TO_HERO_LAST_TURN` is set after each combat. Track per-turn damage history.

**Leaderboard display**
All 8 `PLAYER_LEADERBOARD_PLACE` values are broadcast continuously. Could show a live standings panel.

**Quest completion notification**
`BACON_QUEST_COMPLETED` and `BACON_HERO_HEROPOWER_QUEST_REWARD_COMPLETED` on hero entities.

### Medium effort (requires new state tracking)

**Board state reconstruction (local player)**
By tracking `ZONE=PLAY CONTROLLER=5` minions and their `TAG_CHANGE` updates (ATK, HEALTH, DIVINE_SHIELD, etc.), the full current board can be reconstructed. This enables: buff tracking, enchantment display, attack-order simulation.

**Shop contents tracking**
`ZONE=PLAY CONTROLLER=13` minions are Bob's tavern. As players buy (`ZONE → HAND`) and new minions appear (`FULL_ENTITY ZONE=PLAY CONTROLLER=13`), the shop can be tracked in real time. Useful for "what tier-1 minions have I seen" statistics.

**Triple detection**
`TB_BaconShop_Triples_01` appears when a triple fires; the `DebugPrintEntityChoices` block shows the discover options. Could log triple choices.

**Tier upgrade cost countdown**
The `COST` tag on `TB_BaconShopTechUp02_Button` decrements each turn. Shows exact gold needed to upgrade.

**Opponent hero identification during combat**
`BACON_CURRENT_COMBAT_PLAYER_ID` + `BACON_COMBAT_PHASE_HERO value=1` on the combat hero copy (with its `CardID`) gives the opponent's exact hero. Filter the card list to show that opponent's tribe bonuses or hero power.

**Surviving minion count / combat damage formula**
After `BLOCK_START BlockType=DEATHS` resolves, the surviving `ZONE=PLAY` minions' ATK values sum to form the damage formula (tech_level + Σ survivor ATK). Could predict/verify combat damage.

### Longer term / complex

**Full combat replay**
All attack pairs, damage numbers, deathrattle triggers, and board positions are logged. A complete combat replay could be built from the `ATTACK` and `DEATHS` blocks. Useful for post-game analysis.

**Opponent board scouting (during combat)**
When fighting an opponent, their board is fully narrated. All their minions appear as `ZONE=PLAY CONTROLLER=13` (Bob's controller). Their ATK/HEALTH/divine shield/keywords are all visible. Could reconstruct opponent's board composition for the current fight.

**Historical opponent boards**
Since each combat is logged, you can build a per-player board history. Useful for predicting what opponents might have built by mid-game.

**Death order analysis**
The exact order of minion deaths (from `DEATHS` blocks) is a rich signal for deathrattle and trigger sequencing. Advanced analysis could identify missed lethal or optimal attack order.

**Multi-session statistics (across game resets)**
The log contains multiple games. A session-level statistics layer (average placement, heroes played, final board composition) could be derived from the data.
