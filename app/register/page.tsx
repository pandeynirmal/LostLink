"use client";

import React from "react";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Lock } from "lucide-react";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    organization: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setTimeout(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
  };
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // STEP 1: If OTP not sent yet  Send OTP
      if (!otpSent) {
        if (!formData.email) {
          setError("Email is required");
          setLoading(false);
          return;
        }

        const response = await fetch("/api/auth/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: formData.email }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.message || "Failed to send OTP");
          setLoading(false);
          return;
        }

        setOtpSent(true);
        setLoading(false);
        return;
      }

      // STEP 2: Verify OTP and Register
      if (
        !formData.fullName ||
        !formData.password ||
        !formData.confirmPassword ||
        !formData.organization
      ) {
        setError("All fields are required");
        setLoading(false);
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          otp,
          fullName: formData.fullName,
          password: formData.password,
          organization: formData.organization,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Verification failed");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);

      setTimeout(() => {
        window.location.href = "/signin";
      }, 2000);
    } catch (err) {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-2xl font-bold text-primary">
              Lost & Found AI
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Create Account</h1>
          <p className="text-muted-foreground mt-2">
            Join our secure AI-powered lost and found network
          </p>
        </div>

        {/* Alert Messages */}
        {success && (
          <Alert className="mb-6 border-primary bg-primary/5">
            <AlertDescription className="text-primary">
              Account created successfully! Redirecting to sign in...
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Form Card */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardDescription>
              Register to track your reported items and matches
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <label
                  htmlFor="fullName"
                  className="text-sm font-medium text-foreground"
                >
                  Full Name
                </label>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={handleChange}
                  disabled={loading}
                  className="border-primary/30 focus-visible:ring-primary"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-foreground"
                >
                  Email Address
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading || otpSent} // Disable email field after OTP is sent
                  className="border-primary/30 focus-visible:ring-primary"
                />
              </div>

              {/* Organization */}
              <div className="space-y-2">
                <label
                  htmlFor="organization"
                  className="text-sm font-medium text-foreground"
                >
                  Location / City
                </label>
                <Input
                  id="organization"
                  name="organization"
                  type="text"
                  placeholder="e.g. New York"
                  value={formData.organization}
                  onChange={handleChange}
                  disabled={loading}
                  className="border-primary/30 focus-visible:ring-primary"
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-foreground"
                >
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder=""
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                  className="border-primary/30 focus-visible:ring-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 8 characters
                </p>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium text-foreground"
                >
                  Confirm Password
                </label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder=""
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  disabled={loading}
                  className="border-primary/30 focus-visible:ring-primary"
                />
              </div>
              {/* OTP Field (shown after OTP is sent) */}
              {otpSent && (
                <div className="space-y-2">
                  <label
                    htmlFor="otp"
                    className="text-sm font-medium text-foreground"
                  >
                    Enter OTP
                  </label>
                  <Input
                    id="otp"
                    type="text"
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    disabled={loading}
                    className="border-primary/30 focus-visible:ring-primary"
                  />
                </div>
              )}
              {/* Resend OTP */}
              {otpSent && (
                <div className="text-right">
                  <button
                    type="button"
                    disabled={cooldown > 0 || loading}
                    onClick={async () => {
                      try {
                        setLoading(true);
                        const response = await fetch("/api/auth/send-otp", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: formData.email }),
                        });

                        const data = await response.json();

                        if (!response.ok) {
                          setError(data.message || "Failed to resend OTP");
                          setLoading(false);
                          return;
                        }
                        setError("");
                        setCooldown(30); // 30 second cooldown
                        setOtp("");

                        setLoading(false);
                      } catch (err) {
                        setError("Error resending OTP");
                        setLoading(false);
                      }
                    }}
                    className="text-sm text-primary hover:underline disabled:text-muted-foreground"
                  >
                    {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
                  </button>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground mt-6"
              >
                {loading
                  ? otpSent
                    ? "Verifying..."
                    : "Sending OTP..."
                  : otpSent
                  ? "Verify & Create Account"
                  : "Send OTP"}
              </Button>

              {/* Sign In Link */}
              <p className="text-center text-sm text-muted-foreground mt-4">
                Already have an account?{" "}
                <Link
                  href="/signin"
                  className="text-primary font-semibold hover:underline"
                >
                  Sign In
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Secure verification powered by Blockchain technology
        </p>
      </div>
    </div>
  );
}

