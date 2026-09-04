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
  </tbody>
</table>
