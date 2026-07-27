import type { MetadataRoute } from "next";

/** 홈 화면에 추가하면 독립 앱처럼 뜨게 하는 PWA 매니페스트 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "명함첩",
    short_name: "명함첩",
    description: "명함을 찍어두면 필요할 때 찾아주는 개인용 명함 관리",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4f1",
    theme_color: "#2f4fd8",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
