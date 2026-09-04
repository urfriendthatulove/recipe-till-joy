// Bridge for iMin's built-in thermal printer JS SDK (SDK V2.0).
// On iMin POS devices, the device's browser injects `window.IminPrintInstance`
// automatically (no script tag / plugin install needed on V2.0 firmware).
// This lets us send ESC/POS-style print commands straight to the printer's
// native font/renderer instead of rasterizing HTML through window.print(),
// which is what causes blurry/garbled receipts on integrated POS printers.
// Docs: https://oss-sg.imin.sg/docs/en/JSPrinterSDK.html

export interface IminPrinterInstance {
  PrintConnectType: { USB: number; SPI: number; Bluetooth: number };
  initPrinter: (connectType: number) => void;
  setPageFormat: (style: 0 | 1) => void;
  setTextWidth: (width: number) => void;
  setLeftMargin: (marginValue: number) => void;
  setAlignment: (alignment: 0 | 1 | 2) => void;
  setTextSize: (size: number) => void;
  setTextTypeface?: (typeface: 0 | 1 | 2 | 3 | 4) => void;
  setTextStyle: (style: 0 | 1 | 2 | 3) => void;
  setTextLineSpacing?: (space: number) => void;
  printText: (text: string, type?: 0 | 1) => void;
  printSingleBitmap?: (imgResources: string) => void;
  printColumnsText: (
    colTextArr: string[],
    colWidthArr: number[],
    colAlign: number[],
    size: number[],
    width: number,
  ) => void;
  printAndLineFeed: () => void;
  printAndFeedPaper: (value: number) => void;
  partialCut: () => void;
}

declare global {
  interface Window {
    IminPrintInstance?: IminPrinterInstance;
  }
}

export function getIminPrinter(): IminPrinterInstance | null {
  if (typeof window === "undefined") return null;
  return window.IminPrintInstance ?? null;
}
