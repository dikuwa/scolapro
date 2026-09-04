"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { saveUploadedLearnerPhoto, updateLearnerOperationalProfile, type LearnerProfileState } from "@/features/learners/server/actions";

const initialState: LearnerProfileState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxPhotoBytes = 5 * 1024 * 1024;

function photoExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export function LearnerProfileEditor({ learnerId, schoolId, preferredName, hasPhoto }: { learnerId: string; schoolId: string; preferredName: string | null; hasPhoto: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const clearSelectedPhoto = () => {
    setSelectedPhoto(null);
    setSelectedPhotoUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return null;
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  useEffect(() => () => {
    if (selectedPhotoUrl?.startsWith("blob:")) URL.revokeObjectURL(selectedPhotoUrl);
  }, [selectedPhotoUrl]);

  const [state, action, pending] = useActionState(async (previousState: LearnerProfileState, formData: FormData): Promise<LearnerProfileState> => {
    const photo = formData.get("photo");
    const hasSelectedPhoto = photo instanceof File && photo.size > 0;

    if (hasSelectedPhoto) {
      if (!allowedPhotoTypes.has(photo.type)) {
        const result: LearnerProfileState = { success: false, fieldErrors: { photo: ["Use a JPG, PNG or WebP image."] } };
        toast.error(result.fieldErrors?.photo?.[0] ?? "Choose a supported photo.");
        return result;
      }
      if (photo.size > maxPhotoBytes) {
        const result: LearnerProfileState = { success: false, fieldErrors: { photo: ["Learner photo must be 5 MB or smaller."] } };
        toast.error(result.fieldErrors?.photo?.[0] ?? "Choose a smaller photo.");
        return result;
      }
    }

    const profileFormData = new FormData();
    for (const [key, value] of formData.entries()) {
      if (key !== "photo") profileFormData.append(key, value);
    }

    const profileResult = await updateLearnerOperationalProfile(previousState, profileFormData);
    if (!profileResult.success) {
      if (profileResult.message) toast.error(profileResult.message);
      return profileResult;
    }

    if (hasSelectedPhoto) {
      const supabase = createSupabaseBrowserClient();
      const photoPath = `${schoolId}/${learnerId}/${crypto.randomUUID()}.${photoExtension(photo.type)}`;
      const { error: uploadError } = await supabase.storage.from("learner-photos").upload(photoPath, photo, {
        contentType: photo.type,
        cacheControl: "3600",
        upsert: false,
      });

      if (uploadError) {
        console.error("Learner photo browser upload failed", { statusCode: uploadError.statusCode, error: uploadError.message });
        const result: LearnerProfileState = {
          success: false,
          message: uploadError.message.toLowerCase().includes("row-level security")
            ? "Profile information was saved, but your session is not allowed to upload this learner photo. Sign in again and retry."
            : "Profile information was saved, but the learner photo storage service rejected the upload. The editor is staying open so you can retry.",
        };
        toast.error(result.message ?? "The learner photo upload failed.");
        return result;
      }

      const photoResult = await saveUploadedLearnerPhoto(learnerId, schoolId, photoPath);
      if (!photoResult.success) {
        await supabase.storage.from("learner-photos").remove([photoPath]);
        const result: LearnerProfileState = { success: false, message: photoResult.message ?? "The learner photo could not be linked." };
        toast.error(result.message ?? "The learner photo could not be linked.");
        return result;
      }
    }

    const message = hasSelectedPhoto ? "Learner profile and photo updated." : profileResult.message ?? "Learner profile updated.";
    toast.success(message);
    setOpen(false);
    setRemovePhoto(false);
    clearSelectedPhoto();
    router.refresh();
    return { success: true, message };
  }, initialState);

  const close = () => {
    if (pending) return;
    setOpen(false);
    setRemovePhoto(false);
    clearSelectedPhoto();
  };

  function handlePhotoSelection(file?: File) {
    if (!file) {
      clearSelectedPhoto();
      return;
    }
    if (!allowedPhotoTypes.has(file.type)) {
      toast.error("Use a JPG, PNG or WebP image.");
      clearSelectedPhoto();
      return;
    }
    if (file.size > maxPhotoBytes) {
      toast.error("Learner photo must be 5 MB or smaller.");
      clearSelectedPhoto();
      return;
    }

    setRemovePhoto(false);
    setSelectedPhoto(file.name);
    const objectUrl = URL.createObjectURL(file);
    setSelectedPhotoUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return objectUrl;
    });
  }

  return (
    <div className="w-full sm:w-auto">
      <button type="button" onClick={() => open ? close() : setOpen(true)} aria-expanded={open} className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] transition duration-[var(--motion-base)] ease-[var(--ease-standard)] hover:border-border hover:bg-surface-muted sm:w-auto">
        {open ? <X className="size-3.5" aria-hidden="true" /> : <Pencil className="size-3.5" aria-hidden="true" />}
        {open ? "Close edit" : "Edit learner"}
      </button>

      {open ? (
        <form action={action} className="mt-3 w-full rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-sm)] sm:min-w-[28rem] sm:p-5" noValidate>
          <input type="hidden" name="learnerId" value={learnerId} />
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="removePhoto" value={removePhoto ? "true" : "false"} />

          <div className="flex items-start justify-between gap-3">
            <div><h2 className="scolapro-section-title">Edit learner</h2><p className="scolapro-section-description">Update ordinary school-maintained profile information here.</p></div>
            <button type="button" onClick={close} disabled={pending} className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground disabled:opacity-50" aria-label="Close learner editor"><X className="size-4" aria-hidden="true" /></button>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor={`preferred-name-${learnerId}`} className="text-xs font-medium">Preferred name</label>
              <input id={`preferred-name-${learnerId}`} name="preferredName" defaultValue={preferredName ?? ""} className={`${fieldClass} mt-1.5`} placeholder="Name used in day-to-day school interactions" />
              <p className="mt-1 text-[0.68rem] text-muted-foreground">This does not alter the learner&apos;s official registered names.</p>
              {state.fieldErrors?.preferredName?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{state.fieldErrors.preferredName[0]}</p> : null}
            </div>

            <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3">
              <div className="flex items-center gap-2"><Camera className="size-4 text-muted-foreground" aria-hidden="true" /><p className="text-xs font-semibold">Profile photo</p></div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {selectedPhotoUrl ? <div className="size-14 shrink-0 overflow-hidden rounded-full border border-border-subtle bg-surface"><img src={selectedPhotoUrl} alt="Selected learner preview" className="size-full object-cover" /></div> : null}
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium transition hover:border-border hover:bg-surface-elevated">
                    <ImagePlus className="size-3.5" aria-hidden="true" />
                    {hasPhoto ? "Choose new photo" : "Add photo"}
                    <input ref={fileRef} type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => handlePhotoSelection(event.target.files?.[0])} />
                  </label>
                  {hasPhoto ? <button type="button" onClick={() => { setRemovePhoto((value) => !value); clearSelectedPhoto(); }} className={`inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-xs font-medium transition ${removePhoto ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)]" : "text-muted-foreground hover:bg-[color:var(--danger-soft)] hover:text-[color:var(--danger)]"}`}><Trash2 className="size-3.5" aria-hidden="true" />{removePhoto ? "Photo will be removed" : "Remove photo"}</button> : null}
                </div>
              </div>
              {selectedPhoto ? <p className="mt-2 truncate text-[0.68rem] text-brand-strong">Selected: {selectedPhoto}</p> : null}
              {state.fieldErrors?.photo?.[0] ? <p className="mt-2 text-xs text-[color:var(--danger)]">{state.fieldErrors.photo[0]}</p> : null}
              <p className="mt-2 text-[0.66rem] text-muted-foreground">JPG, PNG or WebP · maximum 5 MB. The preview appears before saving.</p>
            </div>

            <div className="rounded-[var(--radius-sm)] border border-border-subtle px-3 py-3">
              <p className="text-xs font-semibold">Protected official information</p>
              <p className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">Official names, date of birth, sex, admission identity and historical enrolment records are not silently overwritten here. Use the correction workflow on the learner overview when those details are wrong.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
            <button type="button" onClick={close} disabled={pending} className="min-h-9 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-muted-foreground transition hover:bg-surface-muted disabled:opacity-50">Close</button>
            <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-9 items-center gap-2 bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-60">{pending ? <Spinner className="size-3.5 text-white" /> : <Save className="size-3.5" aria-hidden="true" />}{pending ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
