# Aquarium

A relaxed management game that extends **Pêche** (Fishing): the fish you catch arrive alive in your aquarium. Put them in suitable tanks, feed them, keep the water clean, decorate, and visitors come to admire them, leaving coins that you can also spend in Fishing.

*Version française : [README.md](README.md)*

## How it works

1. **The holding pen**: every fish caught in Fishing arrives there alive (60 at most). On your first visit it receives one fish of every species already in your collection.
2. **Tanks**: pick a fish in the pen and click **Put** to place it in the tank on screen. It needs the right water: fresh (pond, river, lake), sea, tropical, polar or abyss, depending on where the species lives. Fish over 60 cm need a medium tank, those over 120 cm a large one.
3. **Care**: fish get hungry and the water gets dirty, **even while NeoDex is closed**. Three gauges at the top of the tank show it: **Hunger**, **Dirty** and **Joy**. **Feed** drops food that the fish swim to, **Clean** clears the water (otherwise it turns green).
4. **Visitors**: happy fish draw a crowd. Their coins pile up in the till; click **Collect** to move them into your Fishing purse. When you come back, the game tells you what visitors left while you were away.

## Fish happiness

Each tank's Joy gauge rises when the fish are fed, the water is clean and there are decorations (up to four count), and drops when the tank is nearly full. The higher it is and the more fish there are, the more coins per hour the tank earns. The line at the top sums up your coins, the till and the hourly income of all your tanks.

## The shop

Everything is paid with Fishing coins:

- **Enlarge** a tank: small (6 places), medium (10 places, 900 coins), large (16 places, 3,500 coins).
- **Filter** (600 coins): the water gets dirty three times more slowly.
- **Feeder** (1,200 coins): feeds the tank by itself.
- **Decorations**: plant, rock, coral, castle, chest or wreck, four at most per tank.
- **New tank**: choose its type of water; each extra tank costs more than the previous one.

A fish you have no room for can be **released**: it gives back half its value. Click a fish in the tank to see its name.

## Data and sync

Your tanks, fish and coins are stored by NeoDex, backed up and synced between your PCs when sync is on. Aquarium needs the **Pêche** plugin, installed automatically with it: both share the same purse.

## Install

In NeoDex: **NeoStore → Discover → Aquarium → Install**.

Building a plugin: see the [NeoDex SDK](https://github.com/NDesumeur/neodex-sdk).
