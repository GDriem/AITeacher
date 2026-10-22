import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { createQueryClient } from "../../app/queryClient";
import { router } from "./router";

export default function BackendApp() {
  const [queries] = useState(createQueryClient);
  return <QueryClientProvider client={queries}><RouterProvider router={router} /></QueryClientProvider>;
}
