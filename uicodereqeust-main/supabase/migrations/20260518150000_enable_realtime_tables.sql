-- Safe inclusion of tables in supabase_realtime publication
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        -- profile_name_update_requests
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND schemaname = 'public' 
            AND tablename = 'profile_name_update_requests'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_name_update_requests;
        END IF;

        -- authorization_requests
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND schemaname = 'public' 
            AND tablename = 'authorization_requests'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.authorization_requests;
        END IF;

        -- support_messages
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND schemaname = 'public' 
            AND tablename = 'support_messages'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
        END IF;
    END IF;
END $$;
