declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfParseResult = {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  };

  export default function pdfParse(buffer: Buffer, options?: { version?: string; pagerender?: (page: unknown) => Promise<string> }): Promise<PdfParseResult>;
}
