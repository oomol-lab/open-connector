# 배포 옵션

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Français](README.fr.md)

[OOMOL Hosted](https://oomol.com/docs/connector-saas/)와
[Self-host](https://oomol.com/docs/openconnector-self-hosting/)는
[README](../README.ko.md)를 참조하세요. 이 페이지는 OpenConnector를 배포할 수 있는 추가 관리형
platform을 정리합니다. 이후에 추가되는 배포 대상도 여기에 기록합니다.

아래 가격은 각 제공자의 공개 요금입니다. 운영 전에 공식 pricing page에서 최신 금액을 확인하세요. 이
platform에서는 OAuth app을 직접 등록해야 합니다. 관리형 OAuth가 필요하면 OOMOL Hosted를 사용하세요.

<table>
  <thead>
    <tr>
      <th align="left" width="22%">플랫폼</th>
      <th align="left">설명</th>
      <th align="center" width="18%">배포</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td valign="middle" align="center">
        <a href="https://www.cloudflare.com/"><img src="../../assets/deployment-options/cloudflare.svg" alt="Cloudflare" width="140"></a>
      </td>
      <td valign="top">
        Cloudflare 계정에서 Workers로 runtime을 실행하고, D1에 상태를 저장하며, R2 또는 Workers KV에
        transit file을 두고, Static Assets로 Web Console을 제공합니다.
        <br><br>
        <strong>장점:</strong> 글로벌 edge network, scale to zero, 넉넉한 무료 한도, R2 egress 요금
        없음. 배포와 OAuth app은 직접 관리합니다.
        <br><br>
        <strong>가격:</strong> Workers Free는 하루 100,000회 요청을 포함합니다. Workers Paid는
        $5/월부터이며 1,000만 회 요청이 포함됩니다. D1과 R2에도 무료 한도가 있습니다.
        <a href="https://developers.cloudflare.com/workers/platform/pricing/">Cloudflare Workers 가격</a>을
        참조하세요.
      </td>
      <td valign="middle" align="center">
        <a href="../cloudflare.md"><strong>배포 가이드</strong></a>
        <br>
        <a href="https://www.youtube.com/watch?v=R0V1ZdCuTgc">빠른 시작 동영상</a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://fly.io"><img src="../../assets/deployment-options/fly-io.svg" alt="Fly.io" width="140"></a>
      </td>
      <td valign="top">
        Fly Machines에서 Node Docker runtime을 실행하고 SQLite를 Fly volume에 유지합니다. 여러
        machine에서는 PostgreSQL을 사용할 수 있습니다. Fly는 TLS, health check, rolling deploy,
        custom domain을 제공합니다.
        <br><br>
        <strong>장점:</strong> 일반적인 Docker host에 가깝고, 영구 volume, 리전 배치, 직관적인
        scaling을 제공합니다.
        <br><br>
        <strong>가격:</strong> 초 단위 사용량 과금입니다. 항상 켜 둔 소형 shared-cpu-1x는 약
        $2/월, 1 GB RAM은 약 $6/월입니다. Volume은 별도입니다.
        <a href="https://fly.io/docs/about/pricing/">Fly.io 가격</a>을 참조하세요.
      </td>
      <td valign="middle" align="center">
        <a href="../fly-io.md"><strong>배포 가이드</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/"><img src="../../assets/deployment-options/repocloud.svg" alt="RepoCloud" width="140"></a>
      </td>
      <td valign="top">
        마켓플레이스에서 원클릭 배포합니다. RepoCloud가 게시된 Docker image를 실행하고 TLS, custom
        domain, resource tier를 처리합니다. RepoCloud 계정 외에 로컬 Docker나 다른 클라우드 계정은
        필요 없습니다.
        <br><br>
        <strong>장점:</strong> hosted instance를 가장 빠르게 만들 수 있고, 선불 시간 과금이며,
        일시 중지 시 정상 요금의 25%만 청구됩니다.
        <br><br>
        <strong>가격:</strong> Container Apps는 1 GB RAM / 1 vCPU 기준 $3/월부터입니다. 시간 단위
        선불 credit이며 장기 계약은 없습니다.
        <a href="https://repocloud.io/pricing">RepoCloud 가격</a>을 참조하세요.
      </td>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/details/Open%20Connector/"><strong>원클릭 배포</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://nibrun.com/"><img src="../../assets/deployment-options/nibrun.svg" alt="nibrun" width="140"></a>
      </td>
      <td valign="top">
        Linux x64 release binary를 전용 Firecracker microVM에서 실행하며 영구 disk와 HTTPS URL이
        제공됩니다. deploy link가 binary URL, port, 환경 변수를 미리 채우고 폼에서 입력할 secret을
        나열합니다. nibrun 계정 외에 Dockerfile이나 다른 클라우드 계정은 필요 없습니다.
        <br><br>
        <strong>장점:</strong> single binary를 원클릭으로 배포할 수 있고, 처음 몇 개의 app은 무료이며,
        유휴 app은 5분 후 절전되었다가 다음 요청에서 깨어납니다.
        <br><br>
        <strong>가격:</strong> 처음 3개 app은 무료이고 그 이후에는 app당 $1/월입니다. 각 app은 1 vCPU,
        256 MiB RAM, 8 GiB disk를 사용하므로 deploy link는 이 메모리 한도를 지키기 위해
        <code>OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS</code>를 활성화합니다.
        <a href="https://nibrun.com/#pricing">nibrun 가격</a>을 참조하세요.
      </td>
      <td valign="middle" align="center">
        <a href="https://app.nibrun.com/deploy?name=open-connector&amp;binary=https%3A%2F%2Fgithub.com%2Foomol-lab%2Fopen-connector%2Freleases%2Flatest%2Fdownload%2Fopen-connector-linux-x64&amp;port=3000&amp;env=HOST%3D0.0.0.0&amp;env=OOMOL_CONNECT_DATA_DIR%3D%24%7BNIBRUN_DATA_DIR%7D&amp;env=OOMOL_CONNECT_ORIGIN%3Dhttps%3A%2F%2F%24%7BNIBRUN_HOSTNAME%7D&amp;env=OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS%3Dtrue&amp;env=OOMOL_CONNECT_ENCRYPTION_KEY&amp;env=OOMOL_CONNECT_ADMIN_TOKEN&amp;env=OOMOL_CONNECT_RUNTIME_TOKEN"><strong>원클릭 배포</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://nexusai.run/"><img src="../../assets/deployment-options/nexus-ai.svg" alt="NEXUS AI" width="140"></a>
      </td>
      <td valign="top">
        저장소의 <code>docker/Dockerfile</code>을 빌드해 자체 HTTPS URL이 있는 컨테이너로 실행합니다.
        배포 링크는 <code>OOMOL_CONNECT_ORIGIN</code>을 그 URL로 설정하고, 폼에서 admin token을 입력받고,
        encryption key와 runtime token을 생성하므로 Web Console과 모든 API가 처음 시작할 때부터 인증을
        요구합니다. secret은 폼에 입력하거나 서버에서 생성되며 링크에는 절대 포함되지 않습니다.
        <br><br>
        <strong>장점:</strong> 소스에서 원클릭 배포, 하나의 대시보드에서 로그와 재배포 관리, 유료 플랜의 커스텀
        도메인. SQLite 데이터베이스는 컨테이너 안에 있어 재시작 후에는 유지되지만 재빌드 후에는 유지되지
        않으므로, 오래 보관할 데이터는 <code>OOMOL_CONNECT_DATABASE_URL</code>을 PostgreSQL로 설정하세요.
        <br><br>
        <strong>가격:</strong> Free 플랜은 공개 HTTPS URL이 있는 활성 배포 1개를 포함하며 신용카드가 필요
        없습니다. 테스트 배포는 자동으로 만료됩니다. Starter는 월 $29로 활성 배포 2개와 커스텀 도메인, Pro는
        월 $149로 5개입니다. 각 앱은 512 MB RAM을 사용합니다.
        <a href="https://nexusai.run/pricing">NEXUS AI 가격</a>을 참고하세요.
      </td>
      <td valign="middle" align="center">
        <a href="https://nexusai.run/deploy?repo=https%3A%2F%2Fgithub.com%2Foomol-lab%2Fopen-connector&amp;dockerfile=docker%2FDockerfile&amp;env=OOMOL_CONNECT_ORIGIN%3D%7Burl%7D&amp;require=OOMOL_CONNECT_ADMIN_TOKEN&amp;generate=OOMOL_CONNECT_ENCRYPTION_KEY&amp;generate=OOMOL_CONNECT_RUNTIME_TOKEN&amp;template=open-connector"><strong>원클릭 배포</strong></a>
      </td>
    </tr>
  </tbody>
</table>
