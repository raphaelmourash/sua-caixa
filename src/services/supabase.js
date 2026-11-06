import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://sapgbneukbkfegicgomc.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_ro8NvmbsyqytdjN7AOb5Gw_AQYMzLk4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)