import { z } from "zod";

export const AVATARS = Array.from({ length: 96 }, (_, index) => ({
  id: index + 1,
  url: `/avatars/avatar-${index + 1}.svg`,
}));
export const AvatarSelectionSchema = z
  .string()
  .refine(
    (value) => AVATARS.some((avatar) => avatar.url === value),
    "Choose an avatar from the collection",
  )
  .nullable();
