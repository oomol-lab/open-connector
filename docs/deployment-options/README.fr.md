# Options de déploiement

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Français](README.fr.md)

[OOMOL hébergé](https://oomol.com/docs/connector-saas/) et
[l'auto-hébergement](https://oomol.com/docs/openconnector-self-hosting/) sont décrits dans le
[README](../README.fr.md). Cette page liste d'autres plateformes gérées sur lesquelles déployer
OpenConnector. Les prochains modes de déploiement seront ajoutés ici.

Les prix ci-dessous sont des tarifs publics de départ. Vérifiez les montants à jour sur la page
pricing de chaque fournisseur avant le lancement. Sur ces plateformes, vous enregistrez vous-même
les apps OAuth ; OOMOL hébergé est le chemin qui inclut l'OAuth géré.

<table>
  <thead>
    <tr>
      <th align="left" width="22%">Plateforme</th>
      <th align="left">Présentation</th>
      <th align="center" width="18%">Déploiement</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td valign="middle" align="center">
        <a href="https://www.cloudflare.com/"><img src="../../assets/deployment-options/cloudflare.svg" alt="Cloudflare" width="140"></a>
      </td>
      <td valign="top">
        Le runtime s'exécute sur Workers, l'état est stocké dans D1, les fichiers de transit dans R2
        ou Workers KV, et la Web Console est servie via Static Assets dans votre compte Cloudflare.
        <br><br>
        <strong>Avantages :</strong> réseau edge mondial, scale to zero, généreux palier gratuit, et
        pas de frais d'egress R2. Vous gérez le déploiement et les apps OAuth.
        <br><br>
        <strong>Prix :</strong> Workers Free inclut 100 000 requêtes/jour. Workers Paid commence à
        5 $/mois avec 10 millions de requêtes incluses. D1 et R2 ont aussi des quotas gratuits. Voir
        <a href="https://developers.cloudflare.com/workers/platform/pricing/">les tarifs Cloudflare Workers</a>.
      </td>
      <td valign="middle" align="center">
        <a href="../cloudflare.md"><strong>Guide de déploiement</strong></a>
        <br>
        <a href="https://www.youtube.com/watch?v=R0V1ZdCuTgc">Vidéo de démarrage rapide</a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://fly.io"><img src="../../assets/deployment-options/fly-io.svg" alt="Fly.io" width="140"></a>
      </td>
      <td valign="top">
        Exécutez le runtime Docker Node sur des Fly Machines, avec SQLite sur un volume Fly, ou
        PostgreSQL pour plusieurs machines. Fly fournit TLS, health checks, rolling deploys et
        domaines personnalisés.
        <br><br>
        <strong>Avantages :</strong> proche d'un hôte Docker classique, volumes persistants,
        placement régional et scaling simple.
        <br><br>
        <strong>Prix :</strong> compute facturé à la seconde. Une petite machine shared-cpu-1x
        toujours allumée coûte environ 2 $/mois ; 1 Go de RAM autour de 6 $/mois. Les volumes sont en
        plus. Voir <a href="https://fly.io/docs/about/pricing/">les tarifs Fly.io</a>.
      </td>
      <td valign="middle" align="center">
        <a href="../fly-io.md"><strong>Guide de déploiement</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/"><img src="../../assets/deployment-options/repocloud.svg" alt="RepoCloud" width="140"></a>
      </td>
      <td valign="top">
        Déploiement marketplace en un clic. RepoCloud exécute l'image Docker publiée et gère TLS,
        les domaines personnalisés et les paliers de ressources. Aucun Docker local ni compte cloud
        supplémentaire n'est requis hors RepoCloud.
        <br><br>
        <strong>Avantages :</strong> chemin le plus rapide vers une instance hébergée, facturation
        horaire prépayée, et pause à 25 % du tarif normal.
        <br><br>
        <strong>Prix :</strong> les Container Apps commencent à 3 $/mois pour 1 Go de RAM / 1 vCPU.
        Crédits prépayés à l'heure, sans contrat long terme. Voir
        <a href="https://repocloud.io/pricing">les tarifs RepoCloud</a>.
      </td>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/details/Open%20Connector/"><strong>Déployer en un clic</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://nibrun.com/"><img src="../../assets/deployment-options/nibrun.svg" alt="nibrun" width="140"></a>
      </td>
      <td valign="top">
        Exécute le binaire de release Linux x64 dans une microVM Firecracker dédiée, avec un disque
        persistant et une URL HTTPS. Le lien de déploiement préremplit l'URL du binaire, le port et
        les variables d'environnement, et liste les secrets que vous renseignez dans le formulaire.
        Aucun Dockerfile ni compte cloud supplémentaire n'est requis hors nibrun.
        <br><br>
        <strong>Avantages :</strong> déploiement en un clic du binaire unique, les premières
        applications sont gratuites, et une application inactive se met en veille au bout de cinq
        minutes puis se réveille à la requête suivante.
        <br><br>
        <strong>Prix :</strong> les 3 premières applications sont gratuites ; chaque application
        suivante coûte 1 $/mois. Chaque application dispose de 1 vCPU, 256 Mio de RAM et 8 Gio de
        disque, donc le lien de déploiement active
        <code>OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS</code> pour rester sous cette limite de mémoire.
        Voir <a href="https://nibrun.com/#pricing">les tarifs nibrun</a>.
      </td>
      <td valign="middle" align="center">
        <a href="https://app.nibrun.com/deploy?name=open-connector&amp;binary=https%3A%2F%2Fgithub.com%2Foomol-lab%2Fopen-connector%2Freleases%2Flatest%2Fdownload%2Fopen-connector-linux-x64&amp;port=3000&amp;env=HOST%3D0.0.0.0&amp;env=OOMOL_CONNECT_DATA_DIR%3D%24%7BNIBRUN_DATA_DIR%7D&amp;env=OOMOL_CONNECT_ORIGIN%3Dhttps%3A%2F%2F%24%7BNIBRUN_HOSTNAME%7D&amp;env=OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS%3Dtrue&amp;env=OOMOL_CONNECT_ENCRYPTION_KEY&amp;env=OOMOL_CONNECT_ADMIN_TOKEN&amp;env=OOMOL_CONNECT_RUNTIME_TOKEN"><strong>Déployer en un clic</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://nexusai.run/"><img src="../../assets/deployment-options/nexus-ai.svg" alt="NEXUS AI" width="140"></a>
      </td>
      <td valign="top">
        Construit le <code>docker/Dockerfile</code> du dépôt dans un conteneur avec sa propre URL HTTPS. Le
        lien de déploiement règle <code>OOMOL_CONNECT_ORIGIN</code> sur cette URL, demande le jeton admin dans
        le formulaire et génère la clé de chiffrement et le jeton runtime, de sorte que la Web Console et
        toutes les API exigent une authentification dès le premier démarrage. Les secrets sont saisis dans le
        formulaire ou générés sur le serveur et n'apparaissent jamais dans le lien.
        <br><br>
        <strong>Avantages :</strong> déploiement en un clic depuis les sources, logs et redéploiements dans
        un seul tableau de bord, et domaines personnalisés sur les offres payantes. La base SQLite vit dans le
        conteneur : elle survit aux redémarrages mais pas aux reconstructions, donc réglez
        <code>OOMOL_CONNECT_DATABASE_URL</code> sur PostgreSQL pour les données à conserver.
        <br><br>
        <strong>Prix :</strong> l'offre Free inclut 1 déploiement actif avec une URL HTTPS publique, sans
        carte bancaire ; les déploiements de test expirent automatiquement. Starter coûte 29 $/mois pour
        2 déploiements actifs et les domaines personnalisés, et Pro 149 $/mois pour 5. Chaque app dispose de
        512 Mo de RAM. Voir
        <a href="https://nexusai.run/pricing">les tarifs NEXUS AI</a>.
      </td>
      <td valign="middle" align="center">
        <a href="https://nexusai.run/deploy?repo=https%3A%2F%2Fgithub.com%2Foomol-lab%2Fopen-connector&amp;dockerfile=docker%2FDockerfile&amp;env=OOMOL_CONNECT_ORIGIN%3D%7Burl%7D&amp;require=OOMOL_CONNECT_ADMIN_TOKEN&amp;generate=OOMOL_CONNECT_ENCRYPTION_KEY&amp;generate=OOMOL_CONNECT_RUNTIME_TOKEN&amp;template=open-connector"><strong>Déployer en un clic</strong></a>
      </td>
    </tr>
  </tbody>
</table>
