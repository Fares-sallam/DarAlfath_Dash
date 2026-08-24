import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext";
import { CountryProvider } from "@/contexts/CountryContext";
import { LogoProvider } from "@/contexts/LogoContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

import Login from "./pages/Login";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Books from "./pages/Books";
import Orders from "./pages/Orders";
import Customers from "./pages/Customers";
import Coupons from "./pages/Coupons";
import PendingPayments from "./pages/PendingPayments";
import HeroSlides from "./pages/HeroSlides";
import IntroVideos from "./pages/IntroVideos";
import Series from "./pages/Series";
import Inventory from "./pages/Inventory";
import Analytics from "./pages/Analytics";
import Shipping from "./pages/Shipping";
import AdminSettings from "./pages/AdminSettings";
import ActivityLog from "./pages/ActivityLog";
import Settings from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 1000,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      networkMode: "online",
    },
    mutations: {
      retry: 0,
      networkMode: "online",
    },
  },
});

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-center" />
        <AuthProvider>
          <CountryProvider>
            <LogoProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<Login />} />

                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Index />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/books"
                    element={
                      <ProtectedRoute permission="can_manage_products">
                        <Books />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/series"
                    element={
                      <ProtectedRoute permission="can_manage_products">
                        <Series />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/orders"
                    element={
                      <ProtectedRoute permission="can_manage_orders">
                        <Orders />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/payments"
                    element={
                      <ProtectedRoute permission="can_manage_orders">
                        <PendingPayments />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/hero-slides"
                    element={
                      <ProtectedRoute permission="can_manage_products">
                        <HeroSlides />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/intro-videos"
                    element={
                      <ProtectedRoute permission="can_manage_products">
                        <IntroVideos />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/coupons"
                    element={
                      <ProtectedRoute permission="can_manage_coupons">
                        <Coupons />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/customers"
                    element={
                      <ProtectedRoute permission="can_manage_users">
                        <Customers />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/admins"
                    element={
                      <ProtectedRoute permission="can_manage_admins">
                        <AdminSettings />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/inventory"
                    element={
                      <ProtectedRoute permission="can_manage_inventory">
                        <Inventory />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/shipping"
                    element={
                      <ProtectedRoute permission="can_manage_shipping">
                        <Shipping />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/analytics"
                    element={
                      <ProtectedRoute permission="can_view_analytics">
                        <Analytics />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/activity"
                    element={
                      <ProtectedRoute permission="can_view_activity_log">
                        <ActivityLog />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute permission="can_manage_settings">
                        <Settings />
                      </ProtectedRoute>
                    }
                  />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </LogoProvider>
          </CountryProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;