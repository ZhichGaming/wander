/**
 * Wander — Zhich, Yu, Justin
 * Sidebar chat: the continuous conversation, streaming render, lasso image
 * bubbles, LaTeX and Markdown rendering, canvas references. Owner: Yu.
 *
 * Placeholder.
 */

import { StyleSheet } from 'react-native';
import {Text, TextInput, View, Pressable} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import Harness from '../harness';
import { Role, Message } from '../harness/agent';

export default function Sidebar(harness: {harness: Harness}) {
    return (
        <View style={styles.SidebarStyle}>
            <ChatOutput />
            <BarUi harness={harness.harness}/>
        </View>
    );
};

function ChatOutput() {
    return (
        <View style={styles.OutputStyle}>
            
        </View>
    )
}

function BarUi(harness: {harness: Harness}) {
    const [text, setText] = useState("")

    return (
        <View style={styles.InbarStyle}>
            <Pressable onPress={() => console.log()}>
                <Feather name="plus" size={24} color="black" />
            </Pressable>

            <TextInput value={text} onChangeText={setText} style={styles.TextboxStyle} placeholder='Ask anything...'>
                
            </TextInput>

            <Pressable onPress={async () => {
                harness.harness.agent.addMessage(new Message(Role.USER, text)); 
                setText("");
                
                const response = await harness.harness.agent.run();
                }}>
                    
                <Ionicons name="send" size={20} color="black" /> 
            </Pressable>

        </View>
    );
}

const styles = StyleSheet.create({
    OutputStyle: {
        display: 'flex', 
    },

    InbarStyle: {
        flexDirection: 'row', 
        borderWidth: 1.5,
        borderRadius: 20,
        padding: 3.5,
        margin: 3.5,
    },

    TextboxStyle: {
        flex: 1
    },

    SidebarStyle: {
        justifyContent: 'flex-end',
        flex: 1
    },
    
})