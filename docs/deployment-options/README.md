# Deployment Options

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Français](README.fr.md)

[OOMOL Hosted](https://oomol.com/docs/connector-saas/) and
[self-hosting](https://oomol.com/docs/openconnector-self-hosting/) are covered in the
[README](../../README.md). This page lists additional managed platforms you can deploy OpenConnector
on. More platforms will be added here as they become available.

Prices are public starting points. Confirm the current numbers on each provider's pricing page
before you launch. You still register OAuth apps yourself on these platforms; OOMOL Hosted is the
path that includes managed OAuth.

<table>
  <thead>
    <tr>
      <th align="left" width="22%">Platform</th>
      <th align="left">Overview</th>
      <th align="center" width="18%">Deploy</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td valign="middle" align="center">
        <a href="https://www.cloudflare.com/"><img src="../../assets/deployment-options/cloudflare.svg" alt="Cloudflare" width="140"></a>
      </td>
      <td valign="top">
        Run the runtime on Workers, store state in D1, keep transit files in R2 or Workers KV, and
        serve the Web Console from Static Assets in your Cloudflare account.
        <br><br>
        <strong>Advantages:</strong> global edge network, scale to zero, generous free tier, and no
        R2 egress fees. You manage deployment and OAuth apps.
        <br><br>
        <strong>Pricing:</strong> Workers Free includes 100,000 requests/day. Workers Paid starts at
        $5/month with 10 million requests included. D1 and R2 also have free allowances. See
        <a href="https://developers.cloudflare.com/workers/platform/pricing/">Cloudflare Workers pricing</a>.
      </td>
      <td valign="middle" align="center">
        <a href="../cloudflare.md"><strong>Deploy guide</strong></a>
        <br>
        <a href="https://www.youtube.com/watch?v=R0V1ZdCuTgc">Quick start video</a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://fly.io"><img src="../../assets/deployment-options/fly-io.svg" alt="Fly.io" width="140"></a>
      </td>
      <td valign="top">
        Run the Node Docker runtime on Fly Machines with SQLite on a Fly volume, or PostgreSQL for
        multi-machine setups. Fly provides TLS, health checks, rolling deploys, and custom domains.
        <br><br>
        <strong>Advantages:</strong> close to a conventional Docker host, persistent volumes,
        regional placement, and straightforward scaling.
        <br><br>
        <strong>Pricing:</strong> usage-based compute billed per second. A small always-on
        shared-cpu-1x machine starts around $2/month; 1 GB RAM is around $6/month. Volumes are
        extra. See <a href="https://fly.io/docs/about/pricing/">Fly.io pricing</a>.
      </td>
      <td valign="middle" align="center">
        <a href="../fly-io.md"><strong>Deploy guide</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/"><img src="../../assets/deployment-options/repocloud.svg" alt="RepoCloud" width="140"></a>
      </td>
      <td valign="top">
        One-click marketplace deploy. RepoCloud runs the published Docker image and handles TLS,
        custom domains, and resource tiers. No local Docker or extra cloud-account setup beyond
        RepoCloud.
        <br><br>
        <strong>Advantages:</strong> fastest path to a hosted instance, prepaid hourly billing, and
        pause billing at 25% of the normal rate.
        <br><br>
        <strong>Pricing:</strong> Container Apps start at $3/month for 1 GB RAM / 1 vCPU. Hourly
        prepaid credits, no long-term contract. See
        <a href="https://repocloud.io/pricing">RepoCloud pricing</a>.
      </td>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/details/Open%20Connector/"><strong>One-click deploy</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://nibrun.com/"><img src="../../assets/deployment-options/nibrun.svg" alt="nibrun" width="140"></a>
      </td>
      <td valign="top">
        Run the Linux x64 release binary in a Firecracker microVM of its own, with a persistent
        disk and an HTTPS URL. The deploy link prefills the binary URL, port, and environment
        variables and lists the secrets you fill in on the form. No Dockerfile or cloud account
        beyond nibrun.
        <br><br>
        <strong>Advantages:</strong> one-click deploy of the single binary, the first apps are
        free, and an idle app sleeps after five minutes and wakes on the next request.
        <br><br>
        <strong>Pricing:</strong> the first 3 apps are free; each app after that is $1/month. Every
        app gets 1 vCPU, 256 MiB RAM, and 8 GiB disk, so the deploy link turns on
        <code>OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS</code> to stay under that memory limit. See
        <a href="https://nibrun.com/#pricing">nibrun pricing</a>.
      </td>
      <td valign="middle" align="center">
        <a href="https://app.nibrun.com/deploy?name=open-connector&amp;binary=https%3A%2F%2Fgithub.com%2Foomol-lab%2Fopen-connector%2Freleases%2Flatest%2Fdownload%2Fopen-connector-linux-x64&amp;port=3000&amp;env=HOST%3D0.0.0.0&amp;env=OOMOL_CONNECT_DATA_DIR%3D%24%7BNIBRUN_DATA_DIR%7D&amp;env=OOMOL_CONNECT_ORIGIN%3Dhttps%3A%2F%2F%24%7BNIBRUN_HOSTNAME%7D&amp;env=OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS%3Dtrue&amp;env=OOMOL_CONNECT_ENCRYPTION_KEY&amp;env=OOMOL_CONNECT_ADMIN_TOKEN&amp;env=OOMOL_CONNECT_RUNTIME_TOKEN"><strong>One-click deploy</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://nexusai.run/"><img src="../../assets/deployment-options/nexus-ai.svg" alt="NEXUS AI" width="140"></a>
      </td>
      <td valign="top">
        Build the repository's <code>docker/Dockerfile</code> into a container with its own HTTPS URL. The
        deploy link sets <code>OOMOL_CONNECT_ORIGIN</code> to that URL, asks for the admin token on the form,
        and generates the encryption key and runtime token, so the Web Console and every API require
        authentication from the first start. Secrets are typed on the form or generated on the server and
        never appear in the link.
        <br><br>
        <strong>Advantages:</strong> one-click deploy from source, logs and redeploys in one dashboard,
        and custom domains on paid plans. The SQLite database lives in the container: it survives restarts
        but not rebuilds, so set <code>OOMOL_CONNECT_DATABASE_URL</code> to PostgreSQL for data that must last.
        <br><br>
        <strong>Pricing:</strong> the Free plan includes 1 active deployment with a public HTTPS URL
        and no credit card; test deployments expire automatically. Starter is $29/month for 2 active
        deployments and custom domains, and Pro is $149/month for 5. Each app gets 512 MB of RAM. See
        <a href="https://nexusai.run/pricing">NEXUS AI pricing</a>.
      </td>
      <td valign="middle" align="center">
        <a href="https://nexusai.run/deploy?repo=https%3A%2F%2Fgithub.com%2Foomol-lab%2Fopen-connector&amp;dockerfile=docker%2FDockerfile&amp;env=OOMOL_CONNECT_ORIGIN%3D%7Burl%7D&amp;require=OOMOL_CONNECT_ADMIN_TOKEN&amp;generate=OOMOL_CONNECT_ENCRYPTION_KEY&amp;generate=OOMOL_CONNECT_RUNTIME_TOKEN&amp;template=open-connector"><strong>One-click deploy</strong></a>
      </td>
    </tr>
  </tbody>
</table>
