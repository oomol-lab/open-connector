import type { ITransitFileService } from "./transit-file-store.ts";

import { expect } from "vitest";
import { bindTransitFilesToScope } from "./transit-file-store.ts";

const missing = { status: 404, code: "file_not_found" };

/** Behaviour every transit backend must share: a file bound to a scope is visible to that scope only. */
export async function expectScopeIsolation(service: ITransitFileService): Promise<void> {
  const a = await service.create(new File(["alpha"], "a.txt", { type: "text/plain" }), { scope: "tenant-a" });
  const b = await service.create(new File(["beta"], "b.txt", { type: "text/plain" }), { scope: "tenant-b" });
  const plain = await service.create(new File(["plain"], "p.txt", { type: "text/plain" }));

  // Operator access sees everything; a scope sees only its own files; the unscoped caller sees only unscoped ones.
  await expect((await service.read(a.fileId)).file.text()).resolves.toBe("alpha");
  await expect((await service.read(a.fileId, { scope: "tenant-a" })).file.text()).resolves.toBe("alpha");
  await expect(service.read(a.fileId, { scope: "tenant-b" })).rejects.toMatchObject(missing);
  await expect(service.read(a.fileId, {})).rejects.toMatchObject(missing);
  await expect(service.response(a.fileId, { scope: "tenant-b" })).rejects.toMatchObject(missing);
  await expect(service.read(plain.fileId, { scope: "tenant-a" })).rejects.toMatchObject(missing);
  await expect((await service.read(plain.fileId, {})).file.text()).resolves.toBe("plain");

  // A refused read leaves the file in place, and another scope cannot delete it.
  await expect(service.delete(a.fileId, { scope: "tenant-b" })).resolves.toBe(false);
  await expect((await service.read(a.fileId, { scope: "tenant-a" })).file.text()).resolves.toBe("alpha");

  // A store bound to a scope applies all of this by itself.
  const bound = bindTransitFilesToScope(service, "tenant-a");
  const made = await bound.create(new File(["more"], "m.txt", { type: "text/plain" }));
  await expect((await bound.read(made.fileId)).file.text()).resolves.toBe("more");
  await expect(bound.read(b.fileId)).rejects.toMatchObject(missing);
  await expect(bound.read(plain.fileId)).rejects.toMatchObject(missing);
  await expect(bindTransitFilesToScope(service, "tenant-b").read(made.fileId)).rejects.toMatchObject(missing);

  // The binding's scope wins over one the caller passes, including an unscoped binding.
  const unbound = bindTransitFilesToScope(service, undefined);
  if (unbound.createFromStream) {
    const streamed = await unbound.createFromStream({
      body: new Blob(["streamed"]).stream(),
      name: "s.txt",
      mimeType: "text/plain",
      scope: "tenant-b",
    });
    await expect((await unbound.read(streamed.fileId)).file.text()).resolves.toBe("streamed");
    await expect(service.delete(streamed.fileId)).resolves.toBe(true);
  }

  // Deleting a scope removes exactly its files.
  await expect(service.deleteByScope("tenant-a")).resolves.toBe(2);
  await expect(service.read(a.fileId)).rejects.toMatchObject(missing);
  await expect(service.read(made.fileId)).rejects.toMatchObject(missing);
  await expect((await service.read(b.fileId)).file.text()).resolves.toBe("beta");
  await expect((await service.read(plain.fileId)).file.text()).resolves.toBe("plain");
  await expect(service.deleteByScope("tenant-a")).resolves.toBe(0);
}
