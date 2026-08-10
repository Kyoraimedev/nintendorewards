# 🎮 Nintendo Rewards Monitor FR

Une extension Chrome pour surveiller les nouvelles récompenses Nintendo disponibles en France!

## 📋 Fonctionnalités

✅ Surveille automatiquement la page des récompenses Nintendo FR  
✅ Parcourt **toutes les pages** de résultats (pas seulement la première)  
✅ Intervalle de vérification **configurable** directement dans le popup (⚙️)  
✅ Détecte aussi les récompenses **indisponibles** (rupture de stock)  
✅ Option pour n'afficher/notifier **que les récompenses disponibles**  
✅ Notifie en temps réel quand une nouvelle récompense apparaît  
✅ Affiche l'**image** de chaque récompense  
✅ Affiche le nombre total de récompenses disponibles  
✅ Historique des récompenses trouvées  
✅ Vérification manuelle à la demande  
✅ Badge avec le nombre de récompenses  
✅ Clic sur une récompense → ouvre directement sa page produit  

## 🚀 Installation

### Étape 1 : Télécharger les fichiers
Vous devez avoir ces 4 fichiers dans un même dossier :
- `manifest.json`
- `background.js`
- `popup.html`
- `popup.js`
- `README.md` (ce fichier)

### Étape 2 : Ouvrir le mode développeur Chrome
1. Ouvrez Chrome
2. Allez à `chrome://extensions/`
3. Activez le **Mode de développement** (en haut à droite)

### Étape 3 : Charger l'extension
1. Cliquez sur **"Charger l'extension non empaquetée"**
2. Sélectionnez le dossier contenant les 4 fichiers
3. L'extension s'ajoutera à votre barre d'outils! 🎉

## 💡 Utilisation

### Popup de l'extension
Cliquez sur l'icône Nintendo (N rouge) pour voir:
- **Nombre de récompenses disponibles**
- **Nombre de nouvelles récompenses depuis votre dernière visite**
- **Liste complète des récompenses trouvées**
- **Date et heure de chaque récompense**

### Notifications
- Des notifications s'affichent automatiquement quand une nouvelle récompense est trouvée
- Cliquez sur la notification pour accéder au store

### Vérification manuelle
- Cliquez sur **"🔄 Vérifier maintenant"** pour forcer une vérification immédiate
- Cliquez sur **"Aller au store"** pour ouvrir directement le lien

### Badge
- Le badge affiche le nombre total de récompenses disponibles
- **Rouge** = nouvelles récompenses trouvées
- **Gris** = aucune nouvelle récompense

## ⚙️ Intervalle de vérification

Par défaut, l'extension vérifie toutes les **5 minutes**.

Vous pouvez changer cet intervalle sans toucher au code :
1. Ouvrez le popup de l'extension
2. Cliquez sur l'icône ⚙️ en haut à droite du header
3. Saisissez le nombre de minutes souhaité (minimum 1)
4. Cliquez sur 💾 Enregistrer

Le changement est appliqué immédiatement (l'alarme est reprogrammée en arrière-plan), et il est conservé même après avoir fermé le popup ou redémarré Chrome.

> Note : Chrome impose un minimum de 1 minute pour les alarmes d'extension ; toute valeur inférieure sera automatiquement ramenée à 1.

## 🎯 Filtrer les récompenses indisponibles

Depuis la version actuelle, l'extension récupère **toutes** les récompenses de la page (disponibles et en rupture de stock), en repérant les cartes marquées `opacity-40` / "En rupture de stock" sur le site.

Dans les réglages (⚙️), activez **"Afficher uniquement les disponibles"** pour :
- ne compter/afficher que les récompenses en stock dans le popup
- ne recevoir de notifications que pour les nouvelles récompenses réellement disponibles

Si l'option est désactivée, tout est affiché mais les indisponibles sont grisées avec un badge "Indisponible".

## 📄 Pagination

La grille de récompenses est répartie sur plusieurs pages (`?page=1`, `?page=2`, ...). L'extension détecte automatiquement le nombre total de pages (via les liens de pagination en bas de la grille) et navigue successivement sur chacune dans l'onglet caché avant de fusionner tous les résultats (avec déduplication par produit).

Par sécurité, elle s'arrête au bout de 20 pages maximum même si la détection se trompe. Comme chaque page nécessite un vrai chargement de l'onglet, une vérification complète peut prendre quelques dizaines de secondes s'il y a beaucoup de pages — c'est normal, ça se passe en arrière-plan.

## 🌐 Pourquoi un onglet caché plutôt qu'un simple fetch() ?

La page des récompenses est une application Next.js qui peuple la grille de produits **côté client**, après le chargement initial. Un `fetch()` classique ne récupère que la coquille HTML sans les cartes produits, quelle que soit l'URL utilisée (avec ou sans paramètres de filtre) — c'est le rendu (client-side vs server-side), pas l'URL, qui détermine si le contenu est présent dans la réponse brute. L'extension ouvre donc un onglet en arrière-plan, attend que la page se charge et que React ait fini de peupler la grille, puis lit le DOM final. C'est plus lourd qu'un fetch, mais c'est la seule méthode fiable ici.

## 🔧 Dépannage

### L'extension ne se lance pas?
1. Vérifiez que tous les fichiers sont dans le même dossier
2. Vérifiez la console (clic droit → Inspecter → Console) pour les erreurs
3. Réchargez l'extension en cliquant sur ⟳ dans `chrome://extensions/`

### Pas de notifications?
1. Vérifiez que vous avez autorisé les notifications Chrome
2. Vérifiez que le Mode de développement est activé
3. Vérifiez les paramètres de notifications de Chrome

### Trop de notifications?
- Augmentez l'intervalle de vérification (ligne 2 de `background.js`)
- Ou diminuez-le si vous voulez vérifier plus souvent

## 📝 Notes techniques

- L'extension stocke les récompenses localement dans le navigateur
- Aucune donnée n'est envoyée à des serveurs externes
- L'historique se réinitialise à chaque redémarrage du navigateur
- Compatible avec Chrome, Edge et navigateurs Chromium

## 🎯 À venir

- [ ] Persistance de l'historique entre les sessions
- [ ] Filtrage par catégorie de récompense
- [ ] Son personnalisé pour les notifications
- [ ] Archivage des récompenses vues

---

Bon monitoring! 🎮✨
