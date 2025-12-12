"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Shield, Loader2 } from "lucide-react";
import { accessControlService, AccessControl } from "@/services/AccessControlService";

interface TeamAccessEditorProps {
    isAdmin: boolean;
}

export function TeamAccessEditor({ isAdmin }: TeamAccessEditorProps) {
    const [accessControl, setAccessControl] = useState<AccessControl | null>(null);
    const [loading, setLoading] = useState(true);
    const [newEmail, setNewEmail] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadAccessControl();
    }, []);

    const loadAccessControl = async () => {
        try {
            setLoading(true);
            const data = await accessControlService.getAccessControl();
            setAccessControl(data);
        } catch (err) {
            console.error("Error loading access control:", err);
            setError("Failed to load access settings");
        } finally {
            setLoading(false);
        }
    };

    const handleAddEmail = async () => {
        if (!newEmail.trim() || !isAdmin) return;

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail.trim())) {
            setError("Please enter a valid email address");
            return;
        }

        try {
            setSaving(true);
            setError(null);
            await accessControlService.addAllowedEmail(newEmail.trim());
            await loadAccessControl();
            setNewEmail("");
        } catch (err) {
            console.error("Error adding email:", err);
            setError("Failed to add email");
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveEmail = async (email: string) => {
        if (!isAdmin) return;

        try {
            setSaving(true);
            setError(null);
            await accessControlService.removeAllowedEmail(email);
            await loadAccessControl();
        } catch (err: unknown) {
            console.error("Error removing email:", err);
            setError(err instanceof Error ? err.message : "Failed to remove email");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Card className="h-full">
                <CardContent className="flex items-center justify-center h-64">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    if (!isAdmin) {
        return (
            <Card className="h-full">
                <CardContent className="flex items-center justify-center h-64">
                    <div className="text-center text-muted-foreground">
                        <Shield className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <p>Only admins can manage team access.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Team Access Control
                </CardTitle>
                <CardDescription>
                    Manage which email addresses can access the proposal directory.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
                {/* Add new email */}
                <div className="flex gap-2">
                    <Input
                        type="email"
                        placeholder="Enter email address..."
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
                        disabled={saving}
                    />
                    <Button onClick={handleAddEmail} disabled={saving || !newEmail.trim()}>
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Plus className="w-4 h-4" />
                        )}
                    </Button>
                </div>

                {error && (
                    <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                        {error}
                    </div>
                )}

                {/* Email list */}
                <div className="flex-1 overflow-y-auto space-y-2">
                    {accessControl?.allowedEmails.map((email) => {
                        const isAdminEmail = accessControlService.isAdmin(email);
                        return (
                            <div
                                key={email}
                                className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-md group"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-sm">{email}</span>
                                    {isAdminEmail && (
                                        <Badge variant="secondary" className="text-xs">
                                            Admin
                                        </Badge>
                                    )}
                                </div>
                                {!isAdminEmail && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => handleRemoveEmail(email)}
                                        disabled={saving}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="text-xs text-muted-foreground pt-2 border-t">
                    {accessControl?.allowedEmails.length || 0} team member(s) with access
                </div>
            </CardContent>
        </Card>
    );
}
