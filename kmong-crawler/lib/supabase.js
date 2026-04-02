const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://byaipfmwicukyzruqtsj.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5YWlwZm13aWN1a3l6cnVxdHNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDk1NzcyOCwiZXhwIjoyMDg2NTMzNzI4fQ.f9tfmHILnyx6ijQjmlS_tDuSBsy9EhN-4ea6h4Xpo8Y';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

module.exports = { supabase };
