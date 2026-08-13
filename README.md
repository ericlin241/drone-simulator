# Web 無人機模擬器

可直接部署至 GitHub Pages 的純前端無人機模擬器。電腦開啟 `index.html` 後會顯示配對 QR Code；手機掃描後可用雙虛擬搖桿控制 3D 無人機。完整操作與疑難排解請見 [GUIDE.md](GUIDE.md)。

## 特色

- Three.js 3D 無人機、停機坪、樹木、建築、陰影與三種相機視角
- PeerJS 點對點即時控制與雙向飛行遙測
- QR Code 快速配對，無須輸入連線代碼
- 美國手 Mode 2／日本手 Mode 1 一鍵切換，並自動記住設定
- 自動起飛、自動降落、馬達鎖定、位置重設與緊急停止
- 雙搖桿「內八」保持 0.8 秒解鎖馬達
- 35%～100% 靈敏度、11% 中心死區、Expo 曲線與軸向誤觸抑制
- 高度、速度、航向、電量與飛行狀態顯示
- 1:1 民航局基本級 15 m × 15 m 多旋翼考場與 8 字參考航線
- 樹木、機棚、訓練門、護欄與角錐碰撞；撞擊後墜機並回傳手機震動警告
- 手機直向時以 CSS 自動旋轉，維持橫向遙控器配置
- 無人機分頁圖示與社群分享大圖、標題及說明
- 無框架、無建置流程，可直接發布至 GitHub Pages

## 本機預覽

請使用 HTTP 伺服器開啟，避免瀏覽器限制 `file://` 頁面的連線功能：

```bash
python3 -m http.server 8000
```

然後在電腦開啟 `http://localhost:8000`。若手機要連入本機預覽，必須使用電腦在區域網路中的 IP 位址；正式部署到 GitHub Pages 後可直接掃描 QR Code。

## GitHub Pages 部署

1. 將此資料夾內容推送到 GitHub 儲存庫。
2. 在儲存庫的 **Settings → Pages** 選擇 **Deploy from a branch**。
3. 選擇要發布的分支與根目錄 `/ (root)`，儲存後等待部署完成。

## 控制方式

| 模式 | 左搖桿上下 | 左搖桿左右 | 右搖桿上下 | 右搖桿左右 |
| --- | --- | --- | --- | --- |
| 美國手 Mode 2 | 油門／升降 | 偏航／旋轉 | 俯仰／前後 | 翻滾／左右 |
| 日本手 Mode 1 | 俯仰／前後 | 偏航／旋轉 | 油門／升降 | 翻滾／左右 |

頁面透過 CDN 載入 Three.js、PeerJS、qrcode.js 與 nipplejs，因此操作時兩台裝置皆需連上網路。PeerJS 預設使用其公用 signaling server；若要用於正式或高可靠度服務，建議改接自架 PeerServer。

## 專案檔案

- `index.html`：電腦端 3D 模擬器、QR Code 與遙測 HUD
- `controller.html`：手機雙搖桿遙控器
- `GUIDE.md`：完整操作、模式說明與疑難排解
- `favicon.svg`：瀏覽器分頁無人機圖示
- `og-cover.png`：社群聊天室連結預覽圖

## 架構摘要

GitHub Pages 只負責提供 HTML、CSS 與 JavaScript 靜態檔案。電腦與手機載入頁面後，由 PeerJS 使用公用 signaling server 協助建立 WebRTC DataChannel；連線完成後，控制與遙測資料在兩個瀏覽器之間即時交換。QR Code 只是把帶有電腦 Peer ID 的手機控制器網址快速交給手機。更完整的流程說明請見 [GUIDE.md](GUIDE.md#9-運作原理為什麼只有-html-也能連線)。

## 技術限制

此專案以 PeerJS 公用 signaling server 協助建立 WebRTC 連線。部分公司、校園或行動網路可能因防火牆或 NAT 規則無法建立點對點連線。這不會影響 GitHub Pages 部署，但正式產品建議自架 PeerServer 與 TURN 服務。
