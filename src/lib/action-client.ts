import { toast } from "sonner";
import type { ActionResult } from "@/actions/run";

/** Call a server action from the client: toast the error, return data or null. */
export async function call<T>(p: Promise<ActionResult<T>>, success?: string): Promise<T | null> {
  try {
    const res = await p;
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    if (success) toast.success(success);
    return res.data;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Something went wrong");
    return null;
  }
}
