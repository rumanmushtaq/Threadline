import { describe, expect, it } from "vitest";
import { cloudinarySignature, toPublicId } from "@/server/storage/cloudinary";

describe("cloudinary driver", () => {
  it("signs parameters the way Cloudinary documents", () => {
    // Example from Cloudinary's "Generating authentication signatures" guide.
    const sig = cloudinarySignature({ eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample_image", timestamp: 1315060510 }, "abcd");
    expect(sig).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("drops the file extension for the public id", () => {
    expect(toPublicId("products/abc/original/123.jpg")).toBe("products/abc/original/123");
    expect(toPublicId("products/abc/original/123-thumb.webp")).toBe("products/abc/original/123-thumb");
  });
});
