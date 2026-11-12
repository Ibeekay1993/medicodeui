import { supabase } from "@/integrations/supabase/client";

export class SupportService {
  static async getConversations() {
    const { data, error } = await supabase
      .from("support_conversations")
      .select("id,ticket_number,subject,status,created_at,updated_at,department,priority,last_message_at,linked_request_id,request_reference,ticket_type,request_ticket_status,tags,assigned_to,hospital_id,created_by")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async getConversation(id: string) {
    const { data, error } = await supabase
      .from("support_conversations")
      .select("id,ticket_number,subject,status,created_at,updated_at,department,priority,last_message,last_message_at,linked_request_id,request_reference,ticket_type,request_ticket_status,tags,assigned_to,hospital_id,created_by")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }

  static async getMessages(conversationId: string) {
    const { data, error } = await supabase
      .from("support_messages")
      .select("id,conversation_id,sender_id,sender_role,sender_name,body,attachment_name,attachment_url,created_at,is_internal,message_type,read_by")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  static async sendMessage(conversationId: string, message: string, senderId: string) {
    const { error } = await supabase.rpc("send_support_message" as any, {
      _conversation_id: conversationId,
      _sender_id: senderId,
      _body: message,
    });
    if (error) throw error;
  }

  static async updateConversationStatus(id: string, status: string) {
    const { error } = await supabase
      .from("support_conversations" as any)
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  static async linkConversation(id: string, targetId: string) {
    const { data, error } = await supabase.rpc("link_support_conversations" as any, {
      _source_id: id,
      _target_id: targetId,
    });
    if (error) throw error;
    return data;
  }

  static async markNotificationsRead(conversationId: string) {
    const { error } = await supabase.rpc("mark_support_notifications_read" as any, {
      _conversation_id: conversationId,
    });
    if (error) throw error;
  }
}
