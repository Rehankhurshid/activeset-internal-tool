"use client";

import { useConfigurations } from "@/hooks/useConfigurations";
import { useAuth } from "@/hooks/useAuth";
import { SimpleListEditor } from "@/app/modules/settings/components/SimpleListEditor";
import { RichItemEditor } from "@/app/modules/settings/components/RichItemEditor";
import { KeyValueEditor } from "@/app/modules/settings/components/KeyValueEditor";
import { TeamAccessEditor } from "@/app/modules/settings/components/TeamAccessEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle, Shield } from "lucide-react";
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function TemplateSettingsPage() {
    const configs = useConfigurations();
    const { isAdmin } = useAuth();

    if (configs.loading) {
        return (
            <div className="container mx-auto py-10">
                <div className="mb-6">
                    <Skeleton className="h-10 w-32" />
                </div>
                <h1 className="text-3xl font-bold mb-6">Template Management</h1>
                <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-[400px] w-full" />
                </div>
            </div>
        );
    }

    if (configs.error) {
        return (
            <div className="container mx-auto py-10">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{configs.error}</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-10 h-screen flex flex-col">
            <div className="mb-6">
                <Link href="/modules/proposal">
                    <Button variant="ghost" className="gap-2 pl-0 hover:bg-transparent hover:text-primary">
                        <ArrowLeft className="w-4 h-4" />
                        Back to Dashboard
                    </Button>
                </Link>
            </div>
            <h1 className="text-3xl font-bold mb-6">Template Management</h1>

            <Tabs defaultValue="about_us" className="flex-grow flex flex-col h-full overflow-hidden">
                <TabsList className="w-full justify-start mb-4 bg-muted/50 p-1 flex-wrap">
                    <TabsTrigger value="about_us">About Us</TabsTrigger>
                    <TabsTrigger value="terms">Terms</TabsTrigger>
                    <TabsTrigger value="titles">Titles</TabsTrigger>
                    <TabsTrigger value="agencies">Agencies</TabsTrigger>
                    <TabsTrigger value="services">Services</TabsTrigger>
                    <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
                    {isAdmin && (
                        <TabsTrigger value="team_access" className="flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            Team Access
                        </TabsTrigger>
                    )}
                </TabsList>

                <div className="flex-grow overflow-hidden">
                    <TabsContent value="about_us" className="h-full m-0">
                        <RichItemEditor title="About Us Templates" docId="about_us" initialItems={configs.aboutUs} />
                    </TabsContent>

                    <TabsContent value="terms" className="h-full m-0">
                        <RichItemEditor title="Terms & Conditions Templates" docId="terms" initialItems={configs.terms} />
                    </TabsContent>

                    <TabsContent value="titles" className="h-full m-0">
                        <SimpleListEditor title="Proposal Titles" docId="titles" initialItems={configs.titles} />
                    </TabsContent>

                    <TabsContent value="agencies" className="h-full m-0">
                        <SimpleListEditor title="Agency Names" docId="agencies" initialItems={configs.agencies} />
                    </TabsContent>

                    <TabsContent value="services" className="h-full m-0">
                        <KeyValueEditor title="Service Snippets" docId="services" initialItems={configs.serviceSnippets} />
                    </TabsContent>

                    <TabsContent value="deliverables" className="h-full m-0">
                        <RichItemEditor title="Final Deliverables" docId="deliverables" initialItems={configs.deliverables} />
                    </TabsContent>

                    {isAdmin && (
                        <TabsContent value="team_access" className="h-full m-0">
                            <TeamAccessEditor isAdmin={isAdmin} />
                        </TabsContent>
                    )}
                </div>
            </Tabs>
        </div>
    );
}
