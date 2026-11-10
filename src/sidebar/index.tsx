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

export default function Sidebar() {
    return (
        <View style={styles.SidebarStyle}>
            <ChatOutput />
            <BarUi />
        </View>
    );
};

function ChatOutput() {
    return (
        <View style={styles.OutputStyle}>
            
        </View>
    )
}

function BarUi() {
    return (
        <View style={styles.InbarStyle}>
            <Pressable onPress={() => console.log()}>
                <Feather name="plus" size={24} color="black" />
            </Pressable>

            <TextInput style={styles.TextboxStyle} placeholder='Ask anything...'>
                
            </TextInput>

            <Pressable onPress={() => console.log()}>
                <Ionicons name="send" size={24} color="black" />
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