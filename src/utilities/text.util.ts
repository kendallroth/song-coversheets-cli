import type { PDFPage, PDFPageDrawTextOptions } from "pdf-lib";
import type { SetRequired } from "type-fest";

/** Draw centered text */
export const drawTextCentered = (
  page: PDFPage,
  location: { y: number },
  text: string,
  fontOptions: SetRequired<PDFPageDrawTextOptions, "font" | "size">,
) => {
  const { width } = page.getSize();

  page.drawText(text, {
    x: width / 2 - fontOptions.font.widthOfTextAtSize(text, fontOptions.size) / 2,
    y: location.y,
    ...fontOptions,
  });
};
