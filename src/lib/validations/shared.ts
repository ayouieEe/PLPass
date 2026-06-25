import { z } from "zod";
import { USER_ROLES } from "@/lib/constants/roles";

export const userRoleSchema = z.enum(USER_ROLES);
