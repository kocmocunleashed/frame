import { expect, test } from "bun:test";
import {
  externalImageURL,
  publicAddress,
  remoteImage,
} from "../server/remote-images";
test("remote image retrieval rejects private, metadata, mapped IPv6, local and credential-bearing URLs", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.1.2",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
  ])
    expect(publicAddress(ip)).toBe(false);
  for (const ip of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])
    expect(publicAddress(ip)).toBe(true);
  for (const url of [
    "http://example.org/image.png",
    "https://127.0.0.1/image",
    "https://[::1]/image",
    "https://169.254.169.254/latest/meta-data",
    "https://user:secret@example.org/image",
    "https://example.org:8080/image",
    "https://localhost/image",
    "https://host.internal/image",
  ])
    expect(() => externalImageURL(url)).toThrow();
  expect(externalImageURL("https://images.example.org/a.png").hostname).toBe(
    "images.example.org",
  );
  await expect(
    remoteImage("https://127.0.0.1/private", new AbortController().signal),
  ).rejects.toThrow("public HTTPS");
});
